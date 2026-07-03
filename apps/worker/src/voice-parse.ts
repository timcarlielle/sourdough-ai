import { Prisma, PrismaClient, type BakeEventPhase } from "@prisma/client";
import OpenAI from "openai";
import { ensureActiveCycleForFeeding, StarterPredictionService } from "db";
import { buildVoiceParseSystemPrompt, buildVoiceParseUserPrompt, VOICE_PROMPT_VERSION } from "./voice-parse-prompt";
import { computeStarterStatus } from "./services/starterStatusEngine";
import { computeBakeStatus } from "./services/bakeStatusEngine";
import {
  generateStarterResponse,
  generateBakeResponse,
  generateUnknownQueryResponse,
} from "./services/responseGenerator";

const APP_TZ = process.env.APP_TIMEZONE || "America/Edmonton";
const OPENAI_MODEL = process.env.OPENAI_MODEL_PARSE || "gpt-4o-mini";

/** Map LLM event_type to our event_type + eventPhase */
export const LLM_EVENT_TO_OUR: Record<string, { eventType: string; eventPhase: BakeEventPhase }> = {
  MIX_START: { eventType: "mix_started", eventPhase: "mixing" },
  AUTOLYSE_START: { eventType: "autolyse_started", eventPhase: "mixing" },
  AUTOLYSE_END: { eventType: "autolyse_ended", eventPhase: "mixing" },
  ADD_SALT: { eventType: "salt_added", eventPhase: "mixing" },
  BULK_START: { eventType: "bulk_started", eventPhase: "bulk_fermentation" },
  BULK_END: { eventType: "bulk_completed", eventPhase: "bulk_fermentation" },
  STRETCH_FOLD: { eventType: "fold_performed", eventPhase: "bulk_fermentation" },
  COIL_FOLD: { eventType: "fold_performed", eventPhase: "bulk_fermentation" },
  LAMINATION: { eventType: "note", eventPhase: "bulk_fermentation" },
  SHAPE: { eventType: "final_shape_completed", eventPhase: "shaping" },
  BENCH_REST_START: { eventType: "bench_rest_started", eventPhase: "dividing" },
  BENCH_REST_END: { eventType: "bench_rest_completed", eventPhase: "dividing" },
  PROOF_START: { eventType: "proof_started", eventPhase: "proofing" },
  PROOF_END: { eventType: "proof_completed", eventPhase: "proofing" },
  FRIDGE_IN: { eventType: "retard_started", eventPhase: "proofing" },
  FRIDGE_OUT: { eventType: "retard_ended", eventPhase: "proofing" },
  PREHEAT_OVEN: { eventType: "oven_preheat_started", eventPhase: "baking" },
  SCORE: { eventType: "score_performed", eventPhase: "baking" },
  OVEN_IN: { eventType: "bake_started", eventPhase: "baking" },
  STEAM_ON: { eventType: "steam_added", eventPhase: "baking" },
  LID_ON: { eventType: "note", eventPhase: "baking" },
  LID_OFF: { eventType: "steam_released", eventPhase: "baking" },
  STEAM_OFF: { eventType: "steam_released", eventPhase: "baking" },
  OVEN_OUT: { eventType: "bake_completed", eventPhase: "baking" },
  COOL_START: { eventType: "cooling_started", eventPhase: "cooling" },
  COOL_END: { eventType: "cooling_completed", eventPhase: "cooling" },
  CUT_OPEN: { eventType: "crumb_evaluated", eventPhase: "evaluation" },
  TASTE_NOTE: { eventType: "flavor_evaluated", eventPhase: "evaluation" },
  OTHER: { eventType: "note", eventPhase: "custom" },
};

type ActionCreateFeeding = {
  type: "CREATE_FEEDING";
  time?: string;
  starter_selector?: string | null;
  flour_g?: number | null;
  water_g?: number | null;
  starter_g?: number | null;
  flour_note?: string | null;
  notes?: string | null;
};

type ActionCreateBakeEvent = {
  type: "CREATE_BAKE_EVENT";
  time?: string;
  bake_selector?: "current" | { by_id: string } | null;
  event_type: string;
  quantity?: { count?: number | null; duration_min?: number | null; temp_c?: number | null } | null;
  note?: string | null;
};

type ActionCreateNote = {
  type: "CREATE_NOTE";
  time?: string;
  bake_selector?: "current" | { by_id: string } | null;
  text: string;
};

type ActionSetBakeOutcome = {
  type: "SET_BAKE_OUTCOME";
  time?: string;
  bake_selector?: "current" | { by_id: string } | null;
  ratings?: {
    crumb?: number | null;
    crust?: number | null;
    oven_spring?: number | null;
    sourness?: number | null;
    appearance?: number | null;
    overall?: number | null;
  } | null;
  tags?: string[] | null;
  notes?: string | null;
};

type Action = ActionCreateFeeding | ActionCreateBakeEvent | ActionCreateNote | ActionSetBakeOutcome;

export type ParsedPlan = {
  intent: string;
  intent_type?: string;
  confidence: number;
  timezone?: string;
  time_ref?: "now" | "relative";
  time_ref_minutes?: number | null;
  effective_time?: string;
  assumptions?: string[];
  actions: Action[];
};

/** Normalize/validate raw LLM JSON into a ParsedPlan. Throws on missing intent. */
export function normalizeParsedPlan(llmResponse: unknown): ParsedPlan {
  const p = llmResponse as ParsedPlan & { actions?: Action[] };
  if (!p || typeof p.intent !== "string") {
    throw new Error("Invalid schema: missing intent");
  }
  const actions = Array.isArray(p.actions) ? p.actions : [];
  return {
    intent: p.intent,
    intent_type: typeof p.intent_type === "string" ? p.intent_type : undefined,
    confidence: typeof p.confidence === "number" ? p.confidence : 0,
    timezone: p.timezone,
    time_ref: p.time_ref === "now" || p.time_ref === "relative" ? p.time_ref : "now",
    time_ref_minutes: typeof p.time_ref_minutes === "number" ? p.time_ref_minutes : null,
    effective_time: typeof p.effective_time === "string" ? p.effective_time : undefined,
    assumptions: Array.isArray(p.assumptions) ? p.assumptions : [],
    actions,
  };
}

/** Compute effective time from log receipt and LLM time_ref. Falls back to parsing ISO when absent (legacy). */
export function computeEffectiveTime(
  parsed: ParsedPlan,
  receivedAt: Date,
  recordedAt: Date,
  tz: string
): Date {
  const anchor = receivedAt ?? recordedAt;
  if (parsed.time_ref === "relative" && typeof parsed.time_ref_minutes === "number" && parsed.time_ref_minutes >= 0) {
    return new Date(anchor.getTime() - parsed.time_ref_minutes * 60 * 1000);
  }
  if (parsed.time_ref === "now" || parsed.time_ref == null) {
    return anchor;
  }
  const legacy = (parsed as { effective_time?: string }).effective_time;
  if (typeof legacy === "string") {
    const d = new Date(legacy);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return anchor;
}

function parseEffectiveTime(s: string, ref: Date, _tz: string): Date {
  try {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d;
  } catch {
    //
  }
  return ref;
}

export async function processVoiceParseAndApplyJob(
  prisma: PrismaClient,
  openai: OpenAI,
  payload: { voiceLogId: string }
): Promise<void> {
  const { voiceLogId } = payload;
  console.log("[voice_parse] Processing", voiceLogId);

  const voiceLog = await prisma.voiceLog.findUnique({
    where: { id: voiceLogId },
    select: { id: true, userId: true, text: true, recordedAt: true, receivedAt: true, status: true },
  });
  if (!voiceLog) {
    console.log("[voice_parse] VoiceLog not found", voiceLogId);
    return;
  }
  if (voiceLog.status !== "pending") {
    console.log("[voice_parse] Already processed", voiceLogId, voiceLog.status);
    return;
  }

  const userId = voiceLog.userId;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { timezone: true },
  });
  const tz = user?.timezone ?? APP_TZ;

  const activeBake = await prisma.bake.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    select: { id: true, recipe: { select: { title: true } } },
  });
  const lastFeeding = await prisma.starterFeeding.findFirst({
    where: {
      userId,
      fedAt: { gte: new Date(Date.now() - 48 * 60 * 60 * 1000) },
    },
    orderBy: { fedAt: "desc" },
    select: { fedAt: true },
  });

  const customEventTypes = await prisma.customBakeEventType.findMany({
    where: { userId },
    select: { eventType: true },
  });
  const customSlugs = customEventTypes.map((t) => t.eventType);

  const context = {
    activeBakeId: activeBake?.id ?? null,
    activeBakeTitle: activeBake?.recipe?.title ?? null,
    lastFeedingAt: lastFeeding?.fedAt.toISOString() ?? null,
    timezone: tz,
  };

  const systemPrompt = buildVoiceParseSystemPrompt(customSlugs);
  const userPrompt = buildVoiceParseUserPrompt(
    voiceLog.text,
    voiceLog.recordedAt.toISOString(),
    context
  );

  let llmResponse: unknown;
  let parsed: ParsedPlan;

  try {
    const completion = await openai.chat.completions.create({
      model: OPENAI_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty LLM response");
    }
    llmResponse = JSON.parse(content) as unknown;
    parsed = normalizeParsedPlan(llmResponse);
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : "Parse failed";
    console.error("[voice_parse] LLM or parse error:", errMsg);
    await prisma.voiceLog.update({
      where: { id: voiceLogId },
      data: {
        status: "error",
        error: errMsg,
        llmModel: OPENAI_MODEL,
        llmPromptVersion: VOICE_PROMPT_VERSION,
        llmRequest: { system: systemPrompt.slice(0, 500), user: userPrompt.slice(0, 500) },
        llmResponse: llmResponse == null ? Prisma.JsonNull : (llmResponse as Prisma.InputJsonValue),
      },
    });
    return;
  }

  const intentType = parsed.intent_type ?? (parsed.intent === "QUERY_STARTER" ? "query_starter_status" : parsed.intent === "QUERY_BAKE" ? "query_bake_status" : undefined);

  if (intentType === "query_starter_status" || intentType === "query_bake_status") {
    const processedAt = new Date();
    let responseText: string;
    try {
      if (intentType === "query_starter_status") {
        const status = await computeStarterStatus(prisma, userId);
        responseText = generateStarterResponse(status, "dry", tz);
      } else {
        const status = await computeBakeStatus(prisma, userId);
        responseText = generateBakeResponse(status, "dry", tz);
      }
    } catch (e) {
      console.error("[voice_parse] Query engine error:", e);
      responseText = "Something went wrong. Try again in the app.";
    }
    await prisma.voiceLog.update({
      where: { id: voiceLogId },
      data: {
        status: "applied",
        error: null,
        responseText,
        intentType,
        processedAt,
        llmModel: OPENAI_MODEL,
        llmPromptVersion: VOICE_PROMPT_VERSION,
        llmRequest: { system: systemPrompt.slice(0, 500), user: userPrompt.slice(0, 500) },
        llmResponse: llmResponse as object,
        appliedActions: [],
      },
    });
    console.log("[voice_parse] Query response saved", voiceLogId, intentType);
    return;
  }

  if (intentType === "unknown" && (parsed.intent === "UNKNOWN" || parsed.intent === "QUERY_STARTER" || parsed.intent === "QUERY_BAKE") && parsed.actions.length === 0) {
    const responseText = generateUnknownQueryResponse();
    await prisma.voiceLog.update({
      where: { id: voiceLogId },
      data: {
        status: "applied",
        error: null,
        responseText,
        intentType: "unknown",
        processedAt: new Date(),
        llmModel: OPENAI_MODEL,
        llmPromptVersion: VOICE_PROMPT_VERSION,
        llmRequest: { system: systemPrompt.slice(0, 500), user: userPrompt.slice(0, 500) },
        llmResponse: llmResponse as object,
        appliedActions: [],
      },
    });
    console.log("[voice_parse] Unknown query fallback", voiceLogId);
    return;
  }

  const applied: { index: number; type: string; id?: string }[] = [];
  let linkedBakeId: string | null = null;
  let closedCycleIdForPost: string | null = null;
  const receiptTime = voiceLog.receivedAt ?? voiceLog.recordedAt;
  const effectiveTime = computeEffectiveTime(parsed, receiptTime, voiceLog.recordedAt, tz);

  await prisma.$transaction(async (tx) => {
    // Resolve "current" bake inside the transaction so we use the latest DB state
    const currentBakeInTx = await tx.bake.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    const currentBakeId = currentBakeInTx?.id ?? null;

    // Default Siri feedings to a starter device when none specified: prefer last feeding with device, else single device or last-seen
    const lastSeenStarter = await tx.starterFeeding.findFirst({
      where: { userId, deviceId: { not: null } },
      orderBy: { fedAt: "desc" },
      select: { deviceId: true },
    });
    let defaultStarterDeviceId: string | null = lastSeenStarter?.deviceId ?? null;
    if (defaultStarterDeviceId == null) {
      const starterDevices = await tx.device.findMany({
        where: { userId, deviceType: "starter_monitor" },
        select: { id: true, lastSeenAt: true },
        orderBy: { lastSeenAt: "desc" },
      });
      if (starterDevices.length === 1) defaultStarterDeviceId = starterDevices[0].id;
      else if (starterDevices.length > 1) defaultStarterDeviceId = starterDevices[0].id; // last seen (ordered by lastSeenAt desc)
    }

    for (let i = 0; i < parsed.actions.length; i++) {
      const action = parsed.actions[i];
      const existing = await tx.voiceLogAction.findUnique({
        where: { voiceLogId_actionIndex: { voiceLogId, actionIndex: i } },
      });
      if (existing) {
        applied.push({ index: i, type: (action as Action).type, id: "skipped" });
        continue;
      }

      const actionTime = (action as Action).time;
      const time =
        typeof actionTime === "string" && actionTime
          ? parseEffectiveTime(actionTime, voiceLog.recordedAt, tz)
          : effectiveTime;

      if (action.type === "CREATE_FEEDING") {
        const a = action as ActionCreateFeeding;
        const starterG = a.starter_g ?? (a.flour_g != null && a.water_g != null ? Math.min(a.flour_g, a.water_g) : 50);
        const flourG = a.flour_g ?? 50;
        const waterG = a.water_g ?? 50;
        const feeding = await tx.starterFeeding.create({
          data: {
            userId,
            fedAt: time,
            starterAmountG: starterG,
            flourAmountG: flourG,
            waterAmountG: waterG,
            flourNotes: a.flour_note ?? undefined,
            notes: a.notes ?? undefined,
            source: "siri",
            deviceId: defaultStarterDeviceId ?? undefined,
          },
        });
        const { closedCycleId } = await ensureActiveCycleForFeeding(tx, feeding.id);
        if (closedCycleId) closedCycleIdForPost = closedCycleId;
        await tx.voiceLogAction.create({ data: { voiceLogId, actionIndex: i } });
        applied.push({ index: i, type: "CREATE_FEEDING", id: feeding.id });
      } else if (action.type === "CREATE_BAKE_EVENT") {
        const a = action as ActionCreateBakeEvent;
        let bakeId: string | null = null;
        if (a.bake_selector === "current") bakeId = currentBakeId;
        else if (a.bake_selector && typeof a.bake_selector === "object" && "by_id" in a.bake_selector)
          bakeId = a.bake_selector.by_id;
        if (bakeId) linkedBakeId = bakeId;
        let mapped = LLM_EVENT_TO_OUR[a.event_type] ?? { eventType: "note", eventPhase: "custom" as BakeEventPhase };
        if (mapped.eventPhase === "custom") {
          const custom = await tx.customBakeEventType.findFirst({
            where: { userId, eventType: a.event_type },
            select: { eventType: true, phase: true },
          });
          if (custom) mapped = { eventType: custom.eventType, eventPhase: custom.phase as BakeEventPhase };
        }
        const metadata: Record<string, unknown> = {};
        if (a.quantity?.count != null) metadata.fold_number = a.quantity.count;
        if (a.quantity?.duration_min != null) metadata.duration_min = a.quantity.duration_min;
        if (a.quantity?.temp_c != null) metadata.temp_c = a.quantity.temp_c;
        const event = await tx.bakeEvent.create({
          data: {
            bakeId,
            userId,
            eventType: mapped.eventType,
            occurredAt: time,
            eventPhase: mapped.eventPhase,
            metadata: Object.keys(metadata).length ? (metadata as Prisma.InputJsonObject) : undefined,
            notes: a.note ?? undefined,
            source: "siri",
          },
        });
        await tx.voiceLogAction.create({ data: { voiceLogId, actionIndex: i } });
        applied.push({ index: i, type: "CREATE_BAKE_EVENT", id: event.id });
      } else if (action.type === "CREATE_NOTE") {
        const a = action as ActionCreateNote;
        let bakeId: string | null = null;
        if (a.bake_selector === "current") bakeId = currentBakeId;
        else if (a.bake_selector && typeof a.bake_selector === "object" && "by_id" in a.bake_selector)
          bakeId = a.bake_selector.by_id;
        if (bakeId) linkedBakeId = bakeId;
        const note = await tx.note.create({
          data: { userId, bakeId, text: a.text, source: "siri" },
        });
        await tx.voiceLogAction.create({ data: { voiceLogId, actionIndex: i } });
        applied.push({ index: i, type: "CREATE_NOTE", id: note.id });
      } else if (action.type === "SET_BAKE_OUTCOME") {
        const a = action as ActionSetBakeOutcome;
        let bakeId: string | null = null;
        if (a.bake_selector === "current") bakeId = currentBakeId;
        else if (a.bake_selector && typeof a.bake_selector === "object" && "by_id" in a.bake_selector)
          bakeId = a.bake_selector.by_id;
        if (!bakeId) {
          applied.push({ index: i, type: "SET_BAKE_OUTCOME", id: "skipped_no_bake" });
          continue;
        }
        linkedBakeId = bakeId;
        const tags = new Set(a.tags ?? []);
        const existing = await tx.bakeOutcome.findFirst({ where: { bakeId }, select: { id: true } });
        const data = {
          crumbOpennessRating: a.ratings?.crumb ?? undefined,
          crustColorRating: a.ratings?.crust ?? undefined,
          sournessRating: a.ratings?.sourness ?? undefined,
          ovenSpringRating: a.ratings?.oven_spring ?? undefined,
          overallRating: a.ratings?.overall ?? undefined,
          appearanceRating: a.ratings?.appearance ?? undefined,
          tooSour: tags.has("too_sour"),
          dense: tags.has("dense"),
          gummy: tags.has("gummy"),
          underproofed: tags.has("underproofed"),
          overproofed: tags.has("overproofed"),
          freeformNotes: a.notes ?? undefined,
        };
        if (existing) {
          await tx.bakeOutcome.update({ where: { id: existing.id }, data });
        } else {
          await tx.bakeOutcome.create({ data: { bakeId, ...data } });
        }
        await tx.voiceLogAction.create({ data: { voiceLogId, actionIndex: i } });
        applied.push({ index: i, type: "SET_BAKE_OUTCOME" });
      }
    }
  });

  if (closedCycleIdForPost) {
    StarterPredictionService.onCycleCompleted(prisma, closedCycleIdForPost).catch((e) =>
      console.warn("[voice_parse] onCycleCompleted failed:", e)
    );
  }

  await prisma.voiceLog.update({
    where: { id: voiceLogId },
    data: {
      status: "applied",
      error: null,
      llmModel: OPENAI_MODEL,
      llmPromptVersion: VOICE_PROMPT_VERSION,
      llmRequest: { system: systemPrompt.slice(0, 2000), user: userPrompt.slice(0, 1000) },
      llmResponse: llmResponse as object,
      appliedActions: applied,
      bakeId: linkedBakeId,
    },
  });
  console.log("[voice_parse] Applied", applied.length, "actions for", voiceLogId);
}
