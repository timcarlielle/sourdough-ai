import type { PrismaClient } from "@prisma/client";
import { StarterPredictionService } from "db";

export type ActivityPhase = "inactive" | "rising" | "peak" | "falling";

export type StarterStatusResult = {
  lastFedAt: Date | null;
  timeSinceFeedHours: number | null;
  activityPhase: ActivityPhase;
  predictedPeakTime: Date | null;
  predictedPeakStartAt: Date | null;
  predictedPeakEndAt: Date | null;
  recommendation: "feed_now" | "ready_soon" | "best_time_to_bake" | "past_prime_feed" | "overdue" | "no_data";
  sassLevel: number;
  /** When set (e.g. insufficient_data), Siri should speak this instead of generic no_data line. */
  message?: string;
};

/**
 * Derive activity phase from now vs prediction window (single source of truth: StarterPredictionService).
 */
function deriveActivityPhase(
  now: Date,
  predictedPeakStartAt: Date,
  predictedPeakAt: Date,
  predictedPeakEndAt: Date
): ActivityPhase {
  const t = now.getTime();
  if (t < predictedPeakStartAt.getTime()) return "rising";
  if (t <= predictedPeakEndAt.getTime()) return "peak";
  return "falling";
}

export async function computeStarterStatus(prisma: PrismaClient, userId: string): Promise<StarterStatusResult> {
  const now = new Date();

  const lastFeeding = await prisma.starterFeeding.findFirst({
    where: { userId },
    orderBy: { fedAt: "desc" },
    select: { id: true, fedAt: true },
  });

  if (!lastFeeding) {
    return {
      lastFedAt: null,
      timeSinceFeedHours: null,
      activityPhase: "inactive",
      predictedPeakTime: null,
      predictedPeakStartAt: null,
      predictedPeakEndAt: null,
      recommendation: "no_data",
      sassLevel: 1,
    };
  }

  const lastFedAt = lastFeeding.fedAt;
  const timeSinceFeedMs = now.getTime() - lastFedAt.getTime();
  const timeSinceFeedHours = timeSinceFeedMs / (60 * 60 * 1000);

  const readiness = await StarterPredictionService.getReadinessForCycle(prisma, userId);

  if (readiness.status !== "ok") {
    return {
      lastFedAt,
      timeSinceFeedHours,
      activityPhase: "inactive",
      predictedPeakTime: null,
      predictedPeakStartAt: null,
      predictedPeakEndAt: null,
      recommendation: "no_data",
      sassLevel: readiness.status === "insufficient_data" ? 0 : 1,
      message: readiness.message,
    };
  }

  const { prediction } = readiness;
  const predictedPeakAt = prediction.prediction.predictedPeakAt;
  const predictedPeakStartAt = prediction.prediction.predictedPeakStartAt;
  const predictedPeakEndAt = prediction.prediction.predictedPeakEndAt;

  const activityPhase = deriveActivityPhase(now, predictedPeakStartAt, predictedPeakAt, predictedPeakEndAt);

  let recommendation: StarterStatusResult["recommendation"] = "no_data";
  let sassLevel = 0;

  if (timeSinceFeedHours >= 24) {
    recommendation = "overdue";
    sassLevel = 2;
  } else if (activityPhase === "rising") {
    recommendation = timeSinceFeedHours < 1 ? "feed_now" : "ready_soon";
    sassLevel = 0;
  } else if (activityPhase === "peak") {
    recommendation = "best_time_to_bake";
    sassLevel = 0;
  } else if (activityPhase === "falling") {
    recommendation = "past_prime_feed";
    sassLevel = 1;
  } else if (timeSinceFeedHours < 2) {
    recommendation = "feed_now";
  } else {
    recommendation = "ready_soon";
  }

  return {
    lastFedAt,
    timeSinceFeedHours,
    activityPhase,
    predictedPeakTime: predictedPeakAt,
    predictedPeakStartAt,
    predictedPeakEndAt,
    recommendation,
    sassLevel,
  };
}
