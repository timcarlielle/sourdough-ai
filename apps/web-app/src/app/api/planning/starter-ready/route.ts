import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeStarterMetrics } from "@/lib/starter-metrics";
import { StarterPredictionService } from "db";
import { getSessionUserId } from "@/lib/session";

export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const recipeId = searchParams.get("recipeId");
  const starterCycleId = searchParams.get("starterCycleId");
  const debug = searchParams.get("debug") === "1";

  const readiness = await StarterPredictionService.getReadinessForCycle(prisma, userId, {
    cycleId: starterCycleId ?? undefined,
  });

  if (readiness.status !== "ok") {
    return NextResponse.json({
      ready: false,
      message: readiness.message,
      state: null,
      metrics: null,
      insufficientData: readiness.status === "insufficient_data",
      recipeId: recipeId ?? null,
    });
  }

  const { prediction } = readiness;
  const cycle = await prisma.starterCycle.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    include: { sourceFeeding: true },
  });
  if (!cycle) {
    return NextResponse.json({
      ready: false,
      message: "No starter cycle.",
      state: null,
      metrics: null,
      recipeId: recipeId ?? null,
    });
  }

  const deviceId = cycle.deviceId ?? cycle.sourceFeeding?.deviceId ?? null;
  if (!deviceId) {
    return NextResponse.json({
      ready: false,
      message: "This cycle has no starter monitor linked.",
      state: null,
      metrics: null,
      recipeId: recipeId ?? null,
    });
  }

  const cycleEnd = cycle.endedAt ?? new Date();
  const readings = await prisma.telemetryReading.findMany({
    where: {
      userId,
      deviceId,
      readingType: "starter",
      recordedAt: { gte: cycle.startedAt, lte: cycleEnd },
    },
    orderBy: { recordedAt: "asc" },
    select: { recordedAt: true, distanceMm: true },
  });
  const points = readings.map((r) => ({ recordedAt: r.recordedAt, distanceMm: r.distanceMm }));
  const peakWindowHalfWidthMinutes =
    (prediction.prediction.predictedPeakAt.getTime() - prediction.prediction.predictedPeakStartAt.getTime()) / (60 * 1000);
  const metrics = computeStarterMetrics(points, cycleEnd, { peakWindowMinutes: peakWindowHalfWidthMinutes });

  const expectedPeakTimeMs = prediction.prediction.predictedPeakAt.getTime();
  const inPredictionWindow =
    cycleEnd.getTime() >= prediction.prediction.predictedPeakStartAt.getTime() &&
    cycleEnd.getTime() <= prediction.prediction.predictedPeakEndAt.getTime();

  let message: string;
  let ready = false;
  let debugInfo: Record<string, unknown> | null = null;
  if (debug) {
    debugInfo = {
      state: metrics.state,
      cycleStartedAt: cycle.startedAt.toISOString(),
      cycleEnd: cycleEnd.toISOString(),
      pointsCount: points.length,
      timeToPeakMinutes: metrics.timeToPeakMinutes,
      predictedPeakAt: new Date(expectedPeakTimeMs).toISOString(),
      predictedTimeToPeakMinutes: prediction.predictedTimeToPeakMinutes,
      lowTempConfidence: readiness.lowTempConfidence,
    };
  }
  if (metrics.state === "peak") {
    ready = true;
    message = "Starter is at peak — ideal for mixing.";
  } else if (metrics.state === "rising") {
    const waitMin = metrics.timeToPeakMinutes != null ? Math.round(metrics.timeToPeakMinutes - (cycleEnd.getTime() - cycle.startedAt.getTime()) / 60000) : null;
    message = waitMin != null && waitMin > 0 ? `Starter is rising. Wait about ${waitMin} minutes for peak.` : "Starter is rising. Peak soon.";
  } else if (metrics.state === "post_peak") {
    const minutesPastExpectedPeak = (cycleEnd.getTime() - expectedPeakTimeMs) / (60 * 1000);
    if (inPredictionWindow) {
      ready = true;
      message = "Starter is within the peak window — good to use now.";
    } else {
      message = "Starter is past peak. Still usable; for best results use at next feeding peak.";
    }
    if (debug && debugInfo) {
      debugInfo.state = "post_peak";
      debugInfo.expectedPeakTimeAt = new Date(expectedPeakTimeMs).toISOString();
      debugInfo.minutesPastExpectedPeak = Math.round(minutesPastExpectedPeak * 10) / 10;
      debugInfo.inPredictionWindow = inPredictionWindow;
      debugInfo.ready = ready;
    }
  } else if (metrics.state === "waking") {
    message = "Starter is waking. Give it more time before mixing.";
  } else {
    message = "Starter is dormant or collapsed. Feed and wait for the next peak.";
  }

  return NextResponse.json({
    ready,
    message,
    state: metrics.state,
    metrics: {
      timeToPeakMinutes: metrics.timeToPeakMinutes,
      peakHeightMm: metrics.peakHeightMm,
      activityScore: metrics.activityScore,
    },
    recipeId: recipeId ?? null,
    lowTempConfidence: readiness.lowTempConfidence ?? false,
    ...(debug && debugInfo ? { debug: debugInfo } : {}),
  });
}
