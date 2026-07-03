import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StarterPredictionService } from "db";
import { getSessionUserId } from "@/lib/session";

const DEFAULT_ROOM_TEMP_C = 22;
const DEFAULT_FRIDGE_TEMP_C = 4;
const DEFAULT_FRIDGE_FACTOR = 0.15; // fridge fermentation 15% of room
const DEFAULT_TOTAL_CLOCK_MINUTES = 12 * 60; // 12h when retard, no constraint
const ROOM_AFTER_FRIDGE_MIN = 30; // min at room after fridge before peak/mix

export type PlanStepType = "FEED" | "FRIDGE_IN" | "FRIDGE_OUT" | "PEAK_WINDOW" | "MIX";

export type PlanStep = {
  type: PlanStepType;
  at: string; // UTC ISO
  label?: string;
};

type Body = {
  targetCompletion: string; // ISO
  recipeId: string;
  retardEnabled?: boolean;
  roomTempC?: number;
  fridgeTempC?: number;
  fridgeFactor?: number;
  feedAtPreferredStart?: string; // ISO datetime or date for "morning"
  feedAtPreferredEnd?: string;
};

/**
 * POST /api/planning/starter-plan
 * Returns recommended feed time, peak window, and optional retard steps (fridge in/out)
 * driven by StarterModel time-to-peak at room temp. All step times in UTC.
 */
export async function POST(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON body required" }, { status: 400 });
  }

  const targetCompletion = body.targetCompletion;
  const recipeId = body.recipeId;
  if (!targetCompletion || !recipeId) {
    return NextResponse.json({ error: "targetCompletion and recipeId required" }, { status: 400 });
  }

  const targetEnd = new Date(targetCompletion);
  if (Number.isNaN(targetEnd.getTime())) {
    return NextResponse.json({ error: "Invalid targetCompletion" }, { status: 400 });
  }

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, userId },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const steps = recipe.steps;
  const bakeOutStep = steps.find((s) => s.eventType === "bake_completed" || s.eventType === "bake_out");
  const mixStep = steps.find((s) => s.eventType === "mix_started" || s.section?.toLowerCase().includes("mix"));
  const mixMinutes = mixStep?.estimatedMinutesFromStart ?? 0;
  const bakeOutMinutes = bakeOutStep?.estimatedMinutesFromStart ?? 360;
  const totalBakeMinutes = bakeOutMinutes;
  const mixTime = new Date(targetEnd.getTime() - totalBakeMinutes * 60 * 1000);

  const roomTempC = body.roomTempC ?? DEFAULT_ROOM_TEMP_C;
  const fridgeTempC = body.fridgeTempC ?? DEFAULT_FRIDGE_TEMP_C;
  const fridgeFactor = Math.max(0.1, Math.min(0.5, body.fridgeFactor ?? DEFAULT_FRIDGE_FACTOR));

  const modelResult = await StarterPredictionService.getTimeToPeakForTemp(prisma, userId, roomTempC);
  if (!modelResult) {
    return NextResponse.json(
      {
        error: "insufficient_data",
        message: "Insufficient data. Collect 2–3 cycles with temperature data to get predictions.",
      },
      { status: 422 }
    );
  }

  const { timeToPeakMinutes, windowHalfWidthMinutes, confidence, modelName } = modelResult;

  const retardEnabled = body.retardEnabled === true;

  let feedTime: Date;
  let planSteps: PlanStep[] = [];
  let fridgeInAt: Date | null = null;
  let fridgeOutAt: Date | null = null;
  let peakWindowStart: Date;
  let peakWindowEnd: Date;

  if (!retardEnabled) {
    feedTime = new Date(mixTime.getTime() - timeToPeakMinutes * 60 * 1000);
    peakWindowStart = new Date(feedTime.getTime() + (timeToPeakMinutes - windowHalfWidthMinutes) * 60 * 1000);
    peakWindowEnd = new Date(feedTime.getTime() + (timeToPeakMinutes + windowHalfWidthMinutes) * 60 * 1000);
    planSteps = [
      { type: "FEED", at: feedTime.toISOString(), label: "Feed starter" },
      { type: "PEAK_WINDOW", at: peakWindowStart.toISOString(), label: "Peak window starts" },
      { type: "MIX", at: mixTime.toISOString(), label: "Mix (use starter at peak)" },
    ];
  } else {
    let totalClockMinutes = DEFAULT_TOTAL_CLOCK_MINUTES;
    if (body.feedAtPreferredStart != null && body.feedAtPreferredEnd != null) {
      const start = new Date(body.feedAtPreferredStart).getTime();
      const end = new Date(body.feedAtPreferredEnd).getTime();
      const mixMs = mixTime.getTime();
      if (end <= mixMs && start < end) {
        const span = (mixMs - end) / (60 * 1000);
        if (span >= timeToPeakMinutes) totalClockMinutes = (mixMs - start) / (60 * 1000);
      }
    } else if (body.feedAtPreferredStart != null) {
      const feedPreferred = new Date(body.feedAtPreferredStart);
      totalClockMinutes = (mixTime.getTime() - feedPreferred.getTime()) / (60 * 1000);
      totalClockMinutes = Math.max(timeToPeakMinutes, Math.min(24 * 60, totalClockMinutes));
    }

    if (totalClockMinutes <= timeToPeakMinutes + ROOM_AFTER_FRIDGE_MIN) {
      totalClockMinutes = timeToPeakMinutes + ROOM_AFTER_FRIDGE_MIN + 60;
    }

    // room1 + fridge*factor + room2 = timeToPeakMinutes; room1 + fridge + room2 = totalClock; room2 = ROOM_AFTER_FRIDGE_MIN
    const effectiveAfterFridge = timeToPeakMinutes - ROOM_AFTER_FRIDGE_MIN;
    const fridgeMinutes = (totalClockMinutes - ROOM_AFTER_FRIDGE_MIN - effectiveAfterFridge) / (1 - fridgeFactor);
    const room1Minutes = totalClockMinutes - ROOM_AFTER_FRIDGE_MIN - fridgeMinutes;
    if (room1Minutes < 30) {
      return NextResponse.json(
        { error: "Retard plan would leave too little room time before fridge. Try a later feed or disable retard." },
        { status: 400 }
      );
    }

    feedTime = new Date(mixTime.getTime() - totalClockMinutes * 60 * 1000);
    fridgeInAt = new Date(feedTime.getTime() + room1Minutes * 60 * 1000);
    fridgeOutAt = new Date(mixTime.getTime() - ROOM_AFTER_FRIDGE_MIN * 60 * 1000);
    peakWindowStart = new Date(mixTime.getTime() - windowHalfWidthMinutes * 60 * 1000);
    peakWindowEnd = new Date(mixTime.getTime() + windowHalfWidthMinutes * 60 * 1000);

    planSteps = [
      { type: "FEED", at: feedTime.toISOString(), label: "Feed starter" },
      { type: "FRIDGE_IN", at: fridgeInAt.toISOString(), label: "Put starter in fridge" },
      { type: "FRIDGE_OUT", at: fridgeOutAt.toISOString(), label: "Remove from fridge to finish rising" },
      { type: "PEAK_WINDOW", at: peakWindowStart.toISOString(), label: "Peak window" },
      { type: "MIX", at: mixTime.toISOString(), label: "Mix (use starter at peak)" },
    ];
  }

  if (retardEnabled && !fridgeInAt) {
    peakWindowStart = new Date(mixTime.getTime() - windowHalfWidthMinutes * 60 * 1000);
    peakWindowEnd = new Date(mixTime.getTime() + windowHalfWidthMinutes * 60 * 1000);
  } else if (!retardEnabled) {
    peakWindowStart = new Date(feedTime.getTime() + (timeToPeakMinutes - windowHalfWidthMinutes) * 60 * 1000);
    peakWindowEnd = new Date(feedTime.getTime() + (timeToPeakMinutes + windowHalfWidthMinutes) * 60 * 1000);
  }

  return NextResponse.json({
    steps: planSteps,
    feedTime: feedTime.toISOString(),
    mixTime: mixTime.toISOString(),
    targetCompletion: targetEnd.toISOString(),
    peakWindowStart: peakWindowStart.toISOString(),
    peakWindowEnd: peakWindowEnd.toISOString(),
    retardEnabled,
    fridgeInAt: fridgeInAt?.toISOString() ?? null,
    fridgeOutAt: fridgeOutAt?.toISOString() ?? null,
    timeToPeakMinutes: Math.round(timeToPeakMinutes),
    windowHalfWidthMinutes: Math.round(windowHalfWidthMinutes),
    confidence,
    modelName,
    roomTempC,
    fridgeTempC,
    fridgeFactor: retardEnabled ? fridgeFactor : null,
    summary: {
      totalBakeMinutes,
      mixMinutes,
    },
  });
}
