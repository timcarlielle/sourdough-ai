import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getDashboardInsightsQueue } from "@/lib/dashboard-insights-queue";
import { aiFeaturesEnabled } from "@/lib/features";
import { StarterPredictionService } from "db";
import { getSessionUserId } from "@/lib/session";

const INSIGHTS_STALE_MS = 5 * 60 * 1000; // 5 min

/** Convert raw sensor distance (top-of-jar to surface) to rise height when baseline is set. */
function riseMm(baselineMm: number | null | undefined, rawMm: number | null | undefined): number | null {
  if (rawMm == null || !Number.isFinite(rawMm)) return null;
  if (baselineMm == null || !Number.isFinite(baselineMm)) return rawMm;
  const rise = baselineMm - rawMm;
  return Number.isFinite(rise) ? rise : null;
}

export async function GET(req: Request) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const [user, devices, cache, currentBake, lastStarterCycle, starterReadings, doughReadings] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true, trackedBakePhases: true },
    }),
    prisma.device.findMany({
      where: { userId, isActive: true },
      select: { id: true, name: true, deviceType: true, lastSeenAt: true, baselineDistanceMm: true },
    }),
    prisma.dashboardInsightCache.findUnique({
      where: { userId },
      select: { insights: true, updatedAt: true },
    }),
    prisma.bake.findFirst({
      where: { userId, endedAt: null },
      orderBy: { startedAt: "desc" },
      include: {
        recipe: {
          include: {
            steps: { orderBy: { sortOrder: "asc" } },
          },
        },
        events: { orderBy: { occurredAt: "asc" } },
        doughDevice: { select: { id: true, name: true } },
      },
    }),
    (async () => {
      const lastFeeding = await prisma.starterFeeding.findFirst({
        where: { userId },
        orderBy: { fedAt: "desc" },
        select: { id: true },
      });
      if (!lastFeeding) return null;
      return prisma.starterCycle.findFirst({
        where: { userId, sourceFeedingId: lastFeeding.id },
        select: { id: true, startedAt: true, endedAt: true, deviceId: true },
      });
    })(),
    prisma.telemetryReading.findMany({
      where: {
        userId,
        device: { deviceType: "starter_monitor" },
      },
      orderBy: { recordedAt: "desc" },
      take: 10,
      select: { id: true, recordedAt: true, distanceMm: true, ambientTempC: true, ambientHumidityPct: true, readingType: true, deviceId: true },
    }),
    prisma.telemetryReading.findMany({
      where: {
        userId,
        device: { deviceType: "dough_monitor" },
      },
      orderBy: { recordedAt: "desc" },
      take: 10,
      select: { id: true, recordedAt: true, distanceMm: true, doughTempC: true, ambientTempC: true, readingType: true, deviceId: true },
    }),
  ]);

  const baselineByDevice = Object.fromEntries(
    (devices as { id: string; baselineDistanceMm?: number | null }[])
      .filter((d) => d.baselineDistanceMm != null)
      .map((d) => [d.id, d.baselineDistanceMm!])
  ) as Record<string, number>;

  const latestStarterReadings = (starterReadings as { deviceId: string; distanceMm: number | null }[]).map((r) => ({
    ...r,
    distanceMm: riseMm(baselineByDevice[r.deviceId], r.distanceMm),
  }));
  const latestDoughReadings = (doughReadings as { deviceId: string; distanceMm: number | null }[]).map((r) => ({
    ...r,
    distanceMm: riseMm(baselineByDevice[r.deviceId], r.distanceMm),
  }));

  // Enqueue insights job if cache stale or missing
  let insights = (cache?.insights as string[] | null) ?? [];
  const aiEnabled = aiFeaturesEnabled();
  const cacheStale = !cache || Date.now() - new Date(cache.updatedAt).getTime() > INSIGHTS_STALE_MS;
  if (cacheStale) {
    if (aiEnabled) {
      try {
        const queue = getDashboardInsightsQueue();
        await queue.add("insights", { userId }, { jobId: `dashboard-${userId}` });
      } catch (e) {
        console.error("Dashboard insights enqueue failed:", e);
      }
    }
    // Live fallback so UI shows correct state when cache is stale or worker hasn't run
    const hasDevices = devices.length > 0;
    const lastFedAt = lastStarterCycle?.startedAt;
    const hoursSinceFed = lastFedAt
      ? (Date.now() - new Date(lastFedAt).getTime()) / (60 * 60 * 1000)
      : Infinity;
    if (!hasDevices) {
      insights = ["Do you even care about me? Connect a device so I can stop guessing."];
    } else if (!lastFedAt || hoursSinceFed >= 24) {
      insights =
        hoursSinceFed >= 24
          ? ["I'm starving. It's been over 24 hours. Feed me."]
          : ["I'm hungry. You haven't fed me yet. Go on, add a feeding."];
    } else {
      insights = ["Device connected and recent feeding recorded. I'm happy."];
    }
  }

  const APP_TZ = process.env.APP_TIMEZONE ?? "America/Edmonton";

  // Feeding cycle rise: telemetry for current/last starter cycle (use cycle device or any starter monitor)
  let feedingCycleRise: { recordedAt: string; distanceMm: number | null }[] = [];
  let feedingCyclePredictedRise: { recordedAt: string; distanceMm: number }[] | null = null;
  let starterPredictionStatus: "ok" | "insufficient_data" | null = null;
  let starterPrediction: {
    modelId: string;
    modelName: string;
    cycleId: string;
    predictedPeakAt: string;
    predictedPeakStartAt: string;
    predictedPeakEndAt: string;
    confidence: number;
    predictedTimeToPeakMinutes: number;
    tempUsedC?: number;
    lowTempConfidence: boolean;
  } | null = null;
  if (lastStarterCycle) {
    const since = lastStarterCycle.startedAt;
    const twentyFourHoursLater = new Date(since.getTime() + 24 * 60 * 60 * 1000);
    const cycleEndOrNow = lastStarterCycle.endedAt ?? new Date();
    const until = new Date(Math.min(cycleEndOrNow.getTime(), twentyFourHoursLater.getTime()));
    const starterDeviceIds = lastStarterCycle.deviceId
      ? [lastStarterCycle.deviceId]
      : devices.filter((d) => d.deviceType === "starter_monitor").map((d) => d.id);
    if (starterDeviceIds.length > 0) {
      const riseReadings = await prisma.telemetryReading.findMany({
        where: {
          deviceId: { in: starterDeviceIds },
          recordedAt: { gte: since, lte: until },
          readingType: "starter",
        },
        orderBy: { recordedAt: "asc" },
        select: { recordedAt: true, distanceMm: true, deviceId: true },
      });
      feedingCycleRise = riseReadings.map((r) => ({
        recordedAt: r.recordedAt.toISOString(),
        distanceMm: riseMm(baselineByDevice[r.deviceId], r.distanceMm),
      }));
    }
    const prediction = await StarterPredictionService.getPredictionForCycle(prisma, lastStarterCycle.id);
    if (prediction?.prediction.predictedSeries) {
      starterPredictionStatus = "ok";
      const firstReadings = feedingCycleRise
        .filter((r) => r.distanceMm != null)
        .slice(0, 3)
        .map((r) => r.distanceMm!);
      const startHeightMm = firstReadings.length > 0
        ? firstReadings.reduce((a, b) => a + b, 0) / firstReadings.length
        : 100;
      const startMs = lastStarterCycle.startedAt.getTime();
      feedingCyclePredictedRise = prediction.prediction.predictedSeries.map((p) => ({
        recordedAt: new Date(startMs + p.tMin * 60 * 1000).toISOString(),
        distanceMm: Math.round((startHeightMm + p.heightMm) * 10) / 10,
      }));
      const model = await prisma.starterModel.findUnique({
        where: { id: prediction.modelId },
        select: { name: true },
      });
      starterPrediction = {
        modelId: prediction.modelId,
        modelName: model?.name ?? "Starter model",
        cycleId: lastStarterCycle.id,
        predictedPeakAt: prediction.prediction.predictedPeakAt.toISOString(),
        predictedPeakStartAt: prediction.prediction.predictedPeakStartAt.toISOString(),
        predictedPeakEndAt: prediction.prediction.predictedPeakEndAt.toISOString(),
        confidence: prediction.prediction.confidence,
        predictedTimeToPeakMinutes: prediction.predictedTimeToPeakMinutes,
        tempUsedC: prediction.tempUsedC,
        lowTempConfidence: prediction.lowTempConfidence ?? false,
      };
    } else {
      starterPredictionStatus = "insufficient_data";
    }
  }

  // Current bake rise: dough telemetry since bake started
  let currentBakeRise: { recordedAt: string; distanceMm: number | null }[] = [];
  if (currentBake?.doughDevice?.id) {
    const doughId = currentBake.doughDevice.id;
    const since = currentBake.startedAt;
    const riseReadings = await prisma.telemetryReading.findMany({
      where: {
        deviceId: doughId,
        recordedAt: { gte: since },
        readingType: "dough",
      },
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true, distanceMm: true },
    });
    currentBakeRise = riseReadings.map((r) => ({
      recordedAt: r.recordedAt.toISOString(),
      distanceMm: riseMm(baselineByDevice[doughId], r.distanceMm),
    }));
  }

  return NextResponse.json({
    userTimezone: user?.timezone ?? "America/Edmonton",
    trackedBakePhases: user?.trackedBakePhases ?? null,
    devices,
    deviceCount: devices.length,
    insights,
    insightsGenerating: cacheStale && aiEnabled,
    currentBake: currentBake
      ? {
          id: currentBake.id,
          startedAt: currentBake.startedAt,
          recipe: currentBake.recipe,
          events: currentBake.events,
          doughDevice: currentBake.doughDevice,
        }
      : null,
    feedingCycleRise: feedingCycleRise.length ? feedingCycleRise : null,
    feedingCyclePredictedRise,
    starterPredictionStatus,
    starterPrediction,
    appTimezone: APP_TZ,
    currentBakeRise: currentBakeRise.length ? currentBakeRise : null,
    lastStarterCycle: lastStarterCycle
      ? { id: lastStarterCycle.id, startedAt: lastStarterCycle.startedAt, endedAt: lastStarterCycle.endedAt }
      : null,
    latestStarterReadings,
    latestDoughReadings,
  });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const code = err && typeof err === "object" && "code" in err ? String((err as { code: string }).code) : undefined;
    console.error("[dashboard] GET error:", message, code ? `(code: ${code})` : "", err);
    return NextResponse.json(
      { error: "Internal server error", message },
      { status: 500 }
    );
  }
}
