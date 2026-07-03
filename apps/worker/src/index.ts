import "dotenv/config";
import { Worker } from "bullmq";
import { PrismaClient, MilestoneType, type BakeEventPhase, type Prisma } from "@prisma/client";
import OpenAI from "openai";
import { readFile } from "fs/promises";
import path from "path";
import { DateTime } from "luxon";
import { ensureActiveCycleForFeeding, StarterPredictionService } from "db";
import { computeStarterMetrics } from "./analytics/starter-metrics";
import { runRuleEngine } from "./analytics/rule-engine";
import { processVoiceParseAndApplyJob } from "./voice-parse";

const APP_TZ = process.env.APP_TIMEZONE || "America/Edmonton";

// Load repo-root .env when running locally (e.g. npm run dev:worker from apps/worker)
const rootEnv = path.resolve(process.cwd(), "../../.env");
try {
  const { config } = await import("dotenv");
  if (!process.env.OPENAI_API_KEY) config({ path: rootEnv });
} catch {
  // dotenv/config already ran; root .env is optional
}

const raw = process.env.OPENAI_API_KEY?.trim() ?? "";
const apiKey = raw.replace(/^["']|["']$/g, "");
const aiEnabled = Boolean(apiKey);
if (!aiEnabled) {
  console.log(
    "[worker] AI features disabled — set OPENAI_API_KEY to enable voice logging, dashboard insights, and recipe scraping. Bake analysis still runs."
  );
} else {
  console.log("[worker] OPENAI_API_KEY set, length", apiKey.length);
}
const prisma = new PrismaClient();
const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";

function getConnection() {
  const u = new URL(redisUrl);
  return {
    host: u.hostname,
    port: Number(u.port) || 6379,
    password: u.password || undefined,
  };
}

const openaiClient: OpenAI | null = aiEnabled ? new OpenAI({ apiKey }) : null;

/** AI processors are only registered when aiEnabled; this guards direct calls. */
function getOpenAI(): OpenAI {
  if (!openaiClient) throw new Error("OPENAI_API_KEY not configured");
  return openaiClient;
}

type VoiceJobPayload = { voiceClipId: string; userId: string; bakeId: string | null };
type VoiceParseJobPayload = { voiceLogId: string };

async function processVoiceJob(payload: VoiceJobPayload) {
  const { voiceClipId, userId, bakeId } = payload;
  console.log("[voice] Processing job:", { voiceClipId, userId, bakeId: bakeId ?? null });

  const clip = await prisma.voiceClip.findFirst({
    where: { id: voiceClipId, userId },
  });
  if (!clip || !clip.audioUrl) {
    console.log("[voice] Skipping: clip or audio URL missing");
    await prisma.voiceClip.updateMany({
      where: { id: voiceClipId },
      data: { status: "failed", errorMessage: "Clip or audio URL missing" },
    });
    return;
  }
  const filename = clip.audioUrl.replace(/^.*\//, "").split("?")[0];
  const uploadDir = process.env.UPLOAD_DIR;
  let audioBuffer: Buffer | null = null;

  if (uploadDir && filename) {
    try {
      const localPath = path.join(uploadDir, filename);
      audioBuffer = await readFile(localPath);
      console.log("[voice] Read audio from shared path:", localPath);
    } catch {
      // File not in shared dir, fall back to fetch
    }
  }

  if (!audioBuffer) {
    const fetchUrl =
      process.env.INTERNAL_WEB_URL && clip.audioUrl.includes("localhost")
        ? clip.audioUrl.replace(/https?:\/\/[^/]+/, process.env.INTERNAL_WEB_URL.replace(/\/$/, ""))
        : clip.audioUrl;
    console.log("[voice] Fetching audio from:", fetchUrl);
    try {
      const resp = await fetch(fetchUrl, {
        headers: process.env.INTERNAL_API_SECRET
          ? { "x-internal-secret": process.env.INTERNAL_API_SECRET }
          : undefined,
      });
      if (!resp.ok) throw new Error(`Fetch ${resp.status}`);
      const ab = await resp.arrayBuffer();
      audioBuffer = Buffer.from(ab);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Fetch failed";
      console.log("[voice] Transcription failed:", msg);
      await prisma.voiceClip.updateMany({
        where: { id: voiceClipId },
        data: { status: "failed", errorMessage: msg },
      });
      return;
    }
  }

  let transcription = "";
  try {
    const file = new File([new Uint8Array(audioBuffer)], "audio.webm", { type: "audio/webm" });
    const transcript = await getOpenAI().audio.transcriptions.create({
      file,
      model: process.env.OPENAI_MODEL_TRANSCRIBE || "whisper-1",
    });
    transcription = transcript.text;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Transcription failed";
    console.log("[voice] Transcription failed:", msg);
    await prisma.voiceClip.updateMany({
      where: { id: voiceClipId },
      data: { status: "failed", errorMessage: msg },
    });
    return;
  }

  await prisma.voiceClip.update({
    where: { id: voiceClipId },
    data: { transcriptionText: transcription, status: "transcribed" },
  });

  console.log("Transcription length:", transcription.length, "chars:", transcription.slice(0, 120) + (transcription.length > 120 ? "…" : ""));

  const nowInAppTz = DateTime.now().setZone(APP_TZ).toISO();
  const parseModel = process.env.OPENAI_MODEL_PARSE || "gpt-4o-mini";
  const extractPrompt = `You are a sourdough baking assistant. Parse this voice-log transcription into exactly one structured JSON object. Output only valid JSON (no markdown, no code fence).

Current time in app timezone (${APP_TZ}): ${nowInAppTz}
Use this exact value for "now" or when the user says "now" or doesn't state a time.

Transcription:
${transcription}

Parsing rules:
- Self-corrections: if the user corrects themselves (e.g. "50 no 60 grams", "about 100, actually 120"), use the final/corrected value (60, 120).
- Equal rations: if they say "equal parts flour and water", "same amount of each", "equal rations", or one amount "of each" / "for both", set both flourAmountG and waterAmountG to that same number (e.g. "60 grams of each" -> flourAmountG: 60, waterAmountG: 60).
- Approximations: "about X grams" -> use X; you may put "approximately" in notes if useful.
- Infer anything reasonable from context. Use 0 only when an amount is truly unknown.

Output exactly one of these JSON shapes:

1) STARTER FEEDING (feeding the starter, amounts, "fed the starter", "just fed", etc.):
{"type":"starter_feeding","fedAt":"ISO8601 (use now if not stated)","starterAmountG":number,"flourAmountG":number,"waterAmountG":number,"flourNotes":string|null,"waterTempC":number|null,"notes":string|null}

2) BAKE MILESTONE (fold, shape, proof, bake in/out, mix, etc.):
{"type":"bake_milestone","milestoneType":"fold|shape|proof_start|bake_in|bake_out|mix|other","occurredAt":"ISO8601","notes":string|null,"foldNumber":number|null}
- For "second fold", "fold 3", etc., set milestoneType "fold" and foldNumber to the number (2, 3).

3) Only if clearly neither a feeding nor a milestone:
{"type":"note","content":string}

Examples of starter_feeding parsing:
- "equal rations of flour and water, about 50 no 60 grams of each" -> type "starter_feeding", flourAmountG: 60, waterAmountG: 60, starterAmountG: 0 (or omit and we treat as 0).
- "25 grams starter, 100 flour 100 water" -> starterAmountG: 25, flourAmountG: 100, waterAmountG: 100.
Use timezone ${APP_TZ} for all times. Output fedAt and occurredAt as ISO8601 with timezone offset (e.g. ${nowInAppTz}). Always use numeric types for amounts (no strings).`;

  let parsed: { type: string; [k: string]: unknown };
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: parseModel,
      messages: [{ role: "user", content: extractPrompt }],
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response");
    parsed = JSON.parse(content) as { type: string; [k: string]: unknown };
    console.log("Parsed type:", parsed.type, "keys:", Object.keys(parsed));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Parse failed";
    console.log("[voice] Parse failed:", msg);
    await prisma.voiceClip.updateMany({
      where: { id: voiceClipId },
      data: { status: "failed", errorMessage: msg, parsedJson: { raw: transcription } },
    });
    return;
  }

  await prisma.voiceClip.update({
    where: { id: voiceClipId },
    data: { parsedJson: parsed as Prisma.InputJsonObject, status: "parsed" },
  });

  const entityIds: { entityType: string; entityId: string }[] = [];

  // Accept camelCase or snake_case from the model. Parse dates in APP_TZ when no offset in string.
  const num = (v: unknown, fallback: number) => (v != null && v !== "" ? Number(v) : fallback);
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);
  const dateOrNow = (v: unknown): Date => {
    if (v == null || v === "") return new Date();
    const s = String(v).trim();
    if (!s) return new Date();
    const hasOffset = /[Zz]$|[+-]\d{2}:?\d{2}$/.test(s);
    if (hasOffset) {
      const d = new Date(s);
      return Number.isNaN(d.getTime()) ? new Date() : d;
    }
    const dt = DateTime.fromISO(s, { zone: APP_TZ });
    return dt.isValid ? dt.toJSDate() : new Date();
  };

  if (parsed.type === "starter_feeding") {
    const fedAt = dateOrNow(parsed.fedAt ?? (parsed as { fed_at?: string }).fed_at);
    const starterAmountG = num(parsed.starterAmountG ?? (parsed as { starter_amount_g?: number }).starter_amount_g, 0);
    const flourAmountG = num(parsed.flourAmountG ?? (parsed as { flour_amount_g?: number }).flour_amount_g, 0);
    const waterAmountG = num(parsed.waterAmountG ?? (parsed as { water_amount_g?: number }).water_amount_g, 0);
    const feeding = await prisma.starterFeeding.create({
      data: {
        userId,
        fedAt,
        starterAmountG,
        flourAmountG,
        waterAmountG,
        flourNotes: str(parsed.flourNotes ?? (parsed as { flour_notes?: string }).flour_notes) ?? undefined,
        waterTempC: parsed.waterTempC != null ? Number(parsed.waterTempC) : (parsed as { water_temp_c?: number }).water_temp_c != null ? Number((parsed as { water_temp_c?: number }).water_temp_c) : undefined,
        notes: str(parsed.notes) ?? undefined,
      },
    });
    entityIds.push({ entityType: "starter_feeding", entityId: feeding.id });
    const { closedCycleId } = await ensureActiveCycleForFeeding(prisma, feeding.id);
    if (closedCycleId) {
      StarterPredictionService.onCycleCompleted(prisma, closedCycleId).catch((e) =>
        console.warn("[worker] onCycleCompleted failed:", e)
      );
    }
    console.log("Created starter_feeding", feeding.id, { starterAmountG, flourAmountG, waterAmountG });
  } else if (parsed.type === "bake_milestone" && bakeId) {
    const occurredAt = dateOrNow(parsed.occurredAt);
    const milestoneType = (parsed.milestoneType as string) || "other";
    const validTypes: MilestoneType[] = ["mix", "autolyse_start", "salt_added", "fold", "shape", "proof_start", "fridge", "bake_in", "bake_out", "score", "steam_on", "steam_off", "other"];
    const type: MilestoneType = validTypes.includes(milestoneType as MilestoneType) ? (milestoneType as MilestoneType) : "other";
    const milestone = await prisma.bakeMilestone.create({
      data: {
        bakeId,
        milestoneType: type,
        occurredAt,
        notes: (parsed.notes as string) ?? undefined,
      },
    });
    entityIds.push({ entityType: "bake_milestone", entityId: milestone.id });

    const milestoneToEvent: Record<string, { eventType: string; eventPhase: BakeEventPhase }> = {
      mix: { eventType: "mix_started", eventPhase: "mixing" },
      autolyse_start: { eventType: "autolyse_started", eventPhase: "mixing" },
      salt_added: { eventType: "salt_added", eventPhase: "mixing" },
      fold: { eventType: "fold_performed", eventPhase: "bulk_fermentation" },
      shape: { eventType: "final_shape_completed", eventPhase: "shaping" },
      proof_start: { eventType: "proof_started", eventPhase: "proofing" },
      fridge: { eventType: "retard_started", eventPhase: "proofing" },
      bake_in: { eventType: "bake_started", eventPhase: "baking" },
      bake_out: { eventType: "bake_completed", eventPhase: "baking" },
      score: { eventType: "score_performed", eventPhase: "baking" },
      steam_on: { eventType: "steam_added", eventPhase: "baking" },
      steam_off: { eventType: "steam_released", eventPhase: "baking" },
      other: { eventType: "note", eventPhase: "custom" },
    };
    const { eventType, eventPhase } = milestoneToEvent[type] ?? { eventType: "note", eventPhase: "custom" as BakeEventPhase };
    const foldNumber = parsed.fold_number != null ? Number(parsed.fold_number) : parsed.foldNumber != null ? Number(parsed.foldNumber) : undefined;
    const event = await prisma.bakeEvent.create({
      data: {
        bakeId,
        userId,
        eventType,
        occurredAt,
        eventPhase,
        metadata: foldNumber != null ? { fold_number: foldNumber } : undefined,
        notes: (parsed.notes as string) ?? undefined,
      },
    });
    entityIds.push({ entityType: "bake_event", entityId: event.id });
    console.log("Created bake_milestone", milestone.id, "and bake_event", event.id);
  } else {
    console.log("Voice clip parsed as type:", parsed.type, "(no entity created for note or unknown type)");
  }
  // type "note" - we could create a generic note table or attach to bake; for MVP we just have the parsed JSON

  for (const { entityType, entityId } of entityIds) {
    await prisma.voiceEventCreated.create({
      data: { voiceClipId, entityType, entityId },
    });
  }
}

type RecipeScrapeJobPayload = { recipeId: string; url: string };

async function processRecipeScrapeJob(payload: RecipeScrapeJobPayload) {
  const { recipeId, url } = payload;
  console.log("[recipe_scrape] Processing:", { recipeId, url });
  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    include: { ingredients: true, steps: true, recipeNotes: true },
  });
  if (!recipe) {
    console.log("[recipe_scrape] Recipe not found:", recipeId);
    return;
  }
  const customTypes = await prisma.customBakeEventType.findMany({
    where: { userId: recipe.userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { eventType: true, label: true, phase: true },
  });
  const customTypesLine =
    customTypes.length > 0
      ? ` You may also use these user-defined event types when a step clearly matches (set eventType to the slug, eventPhase to the phase): ${customTypes.map((t) => `${t.eventType} (${t.phase})`).join(", ")}.`
      : "";
  let html: string;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "SourdoughApp/1.0 (recipe import)" }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new Error(`Fetch ${res.status}`);
    html = await res.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Fetch failed";
    console.log("[recipe_scrape] Fetch failed:", msg);
    await prisma.recipe.update({ where: { id: recipeId }, data: { scrapePending: false } });
    return;
  }
  const text = html
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);
  if (!text || text.length < 100) {
    console.log("[recipe_scrape] Too little text extracted");
    await prisma.recipe.update({ where: { id: recipeId }, data: { scrapePending: false } });
    return;
  }
  const parseModel = process.env.OPENAI_MODEL_PARSE || "gpt-4o-mini";
  const prompt = `Extract a bread/sourdough recipe from this webpage text into structured JSON. Use baker's percentages where possible (flour = 100%). Output only valid JSON, no markdown.

Webpage text:
${text}

Return this exact shape (all arrays; use sortOrder 0,1,2,...):
{"title":string,"description":string|null,"ingredients":[{"name":string,"amountG":number|null,"bakerPct":number|null,"notes":string|null,"sortOrder":number}],"steps":[{"section":string,"stepText":string,"sortOrder":number,"estimatedMinutesFromStart":number|null,"eventType":string|null,"eventPhase":string|null}],"recipeNotes":[{"category":string,"noteText":string,"sortOrder":number}]}
- title: recipe name. description: short summary or null. ingredients: name required; amountG in grams; bakerPct for flour-relative % (flour=100); notes optional.
- steps: Minimize the number of steps — each step should be something the baker steps away from (bulk ferment, proof, bake) or a clear phase. Combine short consecutive actions into one step (e.g. "Flour surface, scrape dough out, shape into a boule" = one Shaping step; "Flip dough out of banneton, score, transfer to vessel, cover and place in oven" = one Baking step with eventType score_performed). Do not split shaping into "scrape out" and "shape" as separate steps; do not split "flip out" and "score, transfer" as separate steps. Proofing: do NOT merge room-temperature proofing and refrigerated proofing/retard into one step. Use separate Proofing steps — one for room-temp proof (eventType proof_started) and one for refrigerate/cold proof/retard (eventType retard_started) — so the timeline can track each phase. section MUST be exactly one of: Mixing, Bulk fermentation, Dividing / Pre-shaping, Shaping, Proofing, Baking, Cooling, Evaluation, Other (use "Proofing" for both room-temp and retard steps). stepText = the full, self-contained instruction. Never use placeholders like "bake according to method" or "see above"; for Baking steps always include actual temperatures and times (e.g. "Preheat to 500°F for 30 minutes. Bake covered 20 minutes, then uncovered at 450°F for 25–30 minutes until done."). estimatedMinutesFromStart = minutes from when the bake/mixing starts (0 for the first step). This value must increase or stay the same as sortOrder increases. eventType: use one of mix_started, autolyse_started, salt_added, fold_performed, bulk_started, bulk_completed, final_shape_completed, proof_started, retard_started, oven_preheat_started, score_performed, bake_started, bake_completed (or null). For baking prep (preheat, flip out, score, load, steam) use oven_preheat_started or score_performed; combine "flip out" + "score and load" into one step. eventPhase: one of mixing, bulk_fermentation, shaping, proofing, baking, cooling (or null). Only set eventType/eventPhase when the step clearly corresponds.${customTypesLine}
- recipeNotes: category e.g. "Timing", noteText the note.`;

  type StepInput = { section: string; stepText: string; sortOrder: number; estimatedMinutesFromStart?: number | null; eventType?: string | null; eventPhase?: string | null };
  let parsed: { title?: string; description?: string | null; ingredients?: Array<{ name: string; amountG?: number | null; bakerPct?: number | null; notes?: string | null; sortOrder: number }>; steps?: StepInput[]; recipeNotes?: Array<{ category: string; noteText: string; sortOrder: number }> };
  try {
    const completion = await getOpenAI().chat.completions.create({
      model: parseModel,
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });
    const content = completion.choices[0]?.message?.content;
    if (!content) throw new Error("Empty response");
    parsed = JSON.parse(content) as typeof parsed;
  } catch (e) {
    console.log("[recipe_scrape] LLM parse failed:", e instanceof Error ? e.message : e);
    await prisma.recipe.update({ where: { id: recipeId }, data: { scrapePending: false } });
    return;
  }
  // Normalize estimatedMinutesFromStart so they never decrease by sortOrder (keeps timeline in recipe order)
  if (parsed.steps?.length) {
    const sorted = [...parsed.steps].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    let prevMin = 0;
    for (const s of sorted) {
      const m = s.estimatedMinutesFromStart;
      if (m != null) {
        if (m < prevMin) s.estimatedMinutesFromStart = prevMin;
        prevMin = s.estimatedMinutesFromStart!;
      }
    }
  }
  await prisma.$transaction(async (tx) => {
    await tx.recipeIngredient.deleteMany({ where: { recipeId } });
    await tx.recipeStep.deleteMany({ where: { recipeId } });
    await tx.recipeNote.deleteMany({ where: { recipeId } });
    if (parsed.ingredients?.length) {
      await tx.recipeIngredient.createMany({
        data: parsed.ingredients.map((i) => ({
          recipeId,
          name: i.name,
          amountG: i.amountG ?? null,
          bakerPct: i.bakerPct ?? null,
          notes: i.notes ?? null,
          sortOrder: i.sortOrder ?? 0,
        })),
      });
    }
    if (parsed.steps?.length) {
      await tx.recipeStep.createMany({
        data: parsed.steps.map((s) => ({
          recipeId,
          section: s.section,
          stepText: s.stepText,
          sortOrder: s.sortOrder ?? 0,
          estimatedMinutesFromStart: s.estimatedMinutesFromStart ?? undefined,
          eventType: s.eventType ?? undefined,
          eventPhase: s.eventPhase ?? undefined,
        })),
      });
    }
    if (parsed.recipeNotes?.length) {
      await tx.recipeNote.createMany({
        data: parsed.recipeNotes.map((n) => ({
          recipeId,
          category: n.category,
          noteText: n.noteText,
          sortOrder: n.sortOrder ?? 0,
        })),
      });
    }
    const recipeData: { title?: string; description?: string | null } = {};
    if (parsed.title != null) recipeData.title = parsed.title;
    if (parsed.description !== undefined) recipeData.description = parsed.description ?? null;
    if (Object.keys(recipeData).length > 0) {
      await tx.recipe.update({ where: { id: recipeId }, data: recipeData });
    }
    await tx.recipe.update({ where: { id: recipeId }, data: { scrapePending: false } });
  });
  console.log("[recipe_scrape] Updated recipe", recipeId);
}

type DashboardInsightsJobPayload = { userId: string };

type AnalyzeBakeJobPayload = { bakeId: string; userId: string };

async function processAnalyzeBakeJob(payload: AnalyzeBakeJobPayload) {
  const { bakeId, userId } = payload;
  console.log("[analyze_bake] Processing:", { bakeId, userId });

  const bake = await prisma.bake.findFirst({
    where: { id: bakeId, userId },
    include: {
      recipe: { include: { steps: { orderBy: { sortOrder: "asc" } } } },
      events: { orderBy: { occurredAt: "asc" } },
      outcomes: true,
      starterCycle: true,
      doughDevice: true,
    },
  });
  if (!bake) {
    console.log("[analyze_bake] Bake not found or not owned by user");
    return;
  }

  let starterMetrics: ReturnType<typeof computeStarterMetrics> | null = null;
  if (bake.starterCycle?.startedAt) {
    const cycleStart = bake.starterCycle.startedAt;
    const cycleEnd = bake.endedAt ?? new Date();
    const deviceId = bake.starterCycle.deviceId;
    if (deviceId) {
      const readings = await prisma.telemetryReading.findMany({
        where: {
          userId,
          deviceId,
          readingType: "starter",
          recordedAt: { gte: cycleStart, lte: cycleEnd },
        },
        orderBy: { recordedAt: "asc" },
        select: { recordedAt: true, distanceMm: true },
      });
      const points = readings.map((r) => ({ recordedAt: r.recordedAt, distanceMm: r.distanceMm }));
      if (points.length >= 2) {
        const modelWindow = await StarterPredictionService.getTimeToPeakForTemp(prisma, userId, 22);
        starterMetrics = computeStarterMetrics(points, {
          now: cycleEnd,
          peakWindowMinutes: modelWindow?.windowHalfWidthMinutes,
        });
        console.log("[analyze_bake] Starter metrics:", starterMetrics.state, starterMetrics.timeToPeakMinutes, "min to peak");
      }
    }
  }

  let doughMetrics: { avgTempC: number | null; maxRiseMm: number | null } = { avgTempC: null, maxRiseMm: null };
  if (bake.doughDevice?.id) {
    const doughReadings = await prisma.telemetryReading.findMany({
      where: {
        deviceId: bake.doughDevice.id,
        readingType: "dough",
        recordedAt: { gte: bake.startedAt, lte: bake.endedAt ?? new Date() },
      },
      select: { doughTempC: true, distanceMm: true },
    });
    if (doughReadings.length > 0) {
      const temps = doughReadings.map((r) => r.doughTempC).filter((t): t is number => t != null);
      doughMetrics.avgTempC = temps.length ? temps.reduce((a, b) => a + b, 0) / temps.length : null;
      const rises = doughReadings.map((r) => r.distanceMm).filter((m): m is number => m != null);
      doughMetrics.maxRiseMm = rises.length ? Math.max(...rises) : null;
    }
  }

  const ruleContext = {
    bake: {
      startedAt: bake.startedAt,
      endedAt: bake.endedAt,
      recipeId: bake.recipeId,
      recipe: {
        steps: bake.recipe.steps.map((s) => ({
          estimatedMinutesFromStart: s.estimatedMinutesFromStart,
          targetState: s.targetState,
          section: s.section,
          eventType: s.eventType,
        })),
      },
      events: bake.events.map((e) => ({
        eventType: e.eventType,
        eventPhase: e.eventPhase,
        occurredAt: e.occurredAt,
      })),
      outcomes: bake.outcomes.map((o) => ({
        sournessRating: o.sournessRating,
        overallRating: o.overallRating,
        ovenSpringRating: o.ovenSpringRating,
        tooSour: o.tooSour,
        underproofed: o.underproofed,
        overproofed: o.overproofed,
        dense: o.dense,
        gummy: o.gummy,
      })),
      starterCycle: bake.starterCycle ? { startedAt: bake.starterCycle.startedAt, deviceId: bake.starterCycle.deviceId } : null,
    },
    starterMetrics,
    doughMetrics,
  };

  const { suggestions, rulesTriggered } = runRuleEngine(ruleContext);

  const payloadJson = {
    suggestions,
    rulesTriggered,
    starterMetrics: starterMetrics
      ? {
          timeToPeakMinutes: starterMetrics.timeToPeakMinutes,
          peakHeightMm: starterMetrics.peakHeightMm,
          growthRatePerHour: starterMetrics.growthRatePerHour,
          declineRatePerHour: starterMetrics.declineRatePerHour,
          state: starterMetrics.state,
          activityScore: starterMetrics.activityScore,
        }
      : null,
    doughMetrics,
  };

  await prisma.recipeAdjustmentSet.create({
    data: {
      recipeId: bake.recipeId,
      bakeId,
      suggestions: payloadJson as unknown as object,
      confidenceScore: suggestions.length > 0 ? 0.8 : null,
    },
  });
  console.log("[analyze_bake] Stored adjustment set for bake", bakeId, "suggestions:", suggestions.length, "rules:", rulesTriggered.length);
}

const FEEDING_DUE_HOURS = 24;

async function processDashboardInsightsJob(payload: DashboardInsightsJobPayload) {
  const { userId } = payload;
  console.log("[dashboard_insights] Processing for user", userId);

  const devices = await prisma.device.findMany({
    where: { userId, isActive: true },
    select: { id: true, name: true, deviceType: true, lastSeenAt: true },
  });
  const lastFeeding = await prisma.starterFeeding.findFirst({
    where: { userId },
    orderBy: { fedAt: "desc" },
    select: { fedAt: true },
  });
  const currentBake = await prisma.bake.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    include: {
      recipe: {
        include: {
          steps: { orderBy: { sortOrder: "asc" } },
        },
      },
      events: { orderBy: { occurredAt: "asc" } },
    },
  });

  const insights: string[] = [];

  // Hardcoded: no devices
  if (devices.length === 0) {
    insights.push("Do you even care about me? Connect a device so I can stop guessing.");
  }

  // Hardcoded: starter needs feeding (no feeding or > 24h)
  const now = DateTime.now().setZone(APP_TZ);
  if (!lastFeeding) {
    insights.push("I'm hungry. You haven't fed me yet. Go on, add a feeding.");
  } else {
    const fedAt = DateTime.fromJSDate(lastFeeding.fedAt, { zone: APP_TZ });
    const hoursSince = now.diff(fedAt, "hours").hours;
    if (hoursSince >= FEEDING_DUE_HOURS) {
      insights.push("I'm starving. It's been over 24 hours. Feed me.");
    }
  }

  // LLM: bake in progress – next step / timing
  if (currentBake && currentBake.recipe?.steps?.length) {
    const startedAt = DateTime.fromJSDate(currentBake.startedAt, { zone: APP_TZ });
    const stepsWithTime = currentBake.recipe.steps
      .filter((s) => s.estimatedMinutesFromStart != null)
      .map((s) => ({
        stepText: s.stepText,
        section: s.section,
        minutesFromStart: s.estimatedMinutesFromStart,
        eventType: s.eventType ?? "step",
      }));
    const eventsSoFar = currentBake.events.map((e) => ({
      eventType: e.eventType,
      at: e.occurredAt,
    }));

    if (stepsWithTime.length > 0) {
      const prompt = `You are a sassy, needy sourdough coach (Jarvis / Iron Man style). The human has an active bake in progress.

Bake started: ${startedAt.toISO()}
Current time: ${now.toISO()}

Recipe timeline (minutes from start): ${JSON.stringify(stepsWithTime)}
Events already logged: ${JSON.stringify(eventsSoFar)}

Return 1–2 short, punchy insights (one sentence each). Tone: a little sassy, a little needy, from the perspective of the dough or starter. Examples: "Your dough is ready for a fold. Don't leave me hanging." or "I've been proofing for hours. Check on me." Output only valid JSON in this exact shape: {"insights": ["first insight", "second insight"]}. No other text.`;

      try {
        const completion = await getOpenAI().chat.completions.create({
          model: process.env.OPENAI_MODEL_PARSE || "gpt-4o-mini",
          messages: [{ role: "user", content: prompt }],
          response_format: { type: "json_object" },
        });
        const content = completion.choices[0]?.message?.content;
        if (content) {
          const parsed = JSON.parse(content) as { insights?: string[] } | string[];
          const list = Array.isArray(parsed) ? parsed : parsed.insights ?? [];
          insights.push(...list.slice(0, 2));
        }
      } catch (e) {
        console.log("[dashboard_insights] LLM failed:", e instanceof Error ? e.message : e);
      }
    }
  }

  // Ensure we have at least one friendly line if nothing else
  if (insights.length === 0) {
    insights.push("All quiet on the fermentation front. I'm here when you need me.");
  }

  await prisma.dashboardInsightCache.upsert({
    where: { userId },
    create: { userId, insights },
    update: { insights },
  });
  console.log("[dashboard_insights] Cached", insights.length, "insights");
}

const conn = getConnection();
const workers: Worker[] = [];

function register<T>(queue: string, tag: string, concurrency: number, run: (data: T) => Promise<void>) {
  const w = new Worker<T>(queue, async (job) => run(job.data), { connection: conn, concurrency });
  w.on("completed", (job) => console.log(`[${tag}] Job`, job.id, "completed"));
  w.on("failed", (job, err) => console.error(`[${tag}] Job`, job?.id, "failed", err));
  w.on("active", (job) => console.log(`[${tag}] Job`, job.id, "started"));
  workers.push(w as Worker);
  console.log(`[${tag}] Worker started, listening on queue '${queue}'`);
}

// Bake analysis is rule-based (no LLM) and always available.
register<AnalyzeBakeJobPayload>("analyze_bake", "analyze_bake", 1, processAnalyzeBakeJob);

// AI-backed queues are only registered when OPENAI_API_KEY is set. Jobs enqueued
// while disabled simply wait; the web UI hides these features via /api/meta.
if (openaiClient) {
  register<VoiceJobPayload>("voice", "voice", 2, processVoiceJob);
  register<RecipeScrapeJobPayload>("recipe_scrape", "recipe_scrape", 1, processRecipeScrapeJob);
  register<DashboardInsightsJobPayload>("dashboard_insights", "dashboard_insights", 1, processDashboardInsightsJob);
  register<VoiceParseJobPayload>("voice_parse_and_apply", "voice_parse", 1, (data) =>
    processVoiceParseAndApplyJob(prisma, openaiClient, data)
  );
}

console.log("[worker] Started (PID %s), AI features:", process.pid, aiEnabled ? "enabled" : "disabled");
function closeAll() {
  for (const w of workers) w.close();
}
process.on("SIGTERM", closeAll);
process.on("SIGINT", closeAll);
