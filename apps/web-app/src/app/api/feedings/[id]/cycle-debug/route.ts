import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StarterPredictionService } from "db";
import { getSessionUserId } from "@/lib/session";

type RawPoint = { tMin: number; distanceMm: number; tempC?: number; humidityPct?: number };
type CleanedPoint = { tMin: number; distanceMm: number };
type HeightPoint = { tMin: number; heightMm: number };
type DebugSeries = {
  rawSeries?: RawPoint[];
  cleanedSeries?: CleanedPoint[];
  smoothedSeries?: HeightPoint[];
  fittedSeries?: HeightPoint[];
};

function toChartSeries(
  startMs: number,
  points: { tMin: number; heightMm?: number; distanceMm?: number }[],
  baselineMm?: number
): { recordedAt: string; heightMm: number }[] {
  return points.map((p) => {
    const heightMm =
      p.heightMm != null
        ? p.heightMm
        : baselineMm != null && p.distanceMm != null
          ? baselineMm - p.distanceMm
          : 0;
    return {
      recordedAt: new Date(startMs + p.tMin * 60 * 1000).toISOString(),
      heightMm: Math.round(heightMm * 10) / 10,
    };
  });
}

/** GET /api/feedings/[id]/cycle-debug — analysis + debug series + prediction for debugging. */
export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getSessionUserId(req);
    if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const feedingId = (await params).id;

    const feeding = await prisma.starterFeeding.findFirst({
    where: { id: feedingId, userId },
    select: { id: true },
  });
  if (!feeding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cycle = await prisma.starterCycle.findFirst({
    where: { userId, sourceFeedingId: feedingId },
    select: { id: true, startedAt: true, endedAt: true, deviceId: true, status: true },
  });

  if (!cycle) {
    return NextResponse.json({
      cycle: null,
      analysis: null,
      prediction: null,
      series: null,
      isCurrentCycle: false,
    });
  }

  const lastCycle = await prisma.starterCycle.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  const isCurrentCycle = !!lastCycle && lastCycle.id === cycle.id;

  const analysis = await prisma.starterCycleAnalysis.findUnique({
    where: { cycleId: cycle.id },
  });

  const prediction = await StarterPredictionService.getPredictionForCycle(prisma, cycle.id);

  const startMs = cycle.startedAt.getTime();
  const baselineMm = analysis?.baselineDistanceMm ?? null;
  const debug = (analysis?.debugSeries as DebugSeries | null) ?? {};

  const rawSeries = debug.rawSeries ?? [];
  const cleanedSeries = debug.cleanedSeries ?? [];
  const smoothedSeries = debug.smoothedSeries ?? [];
  const fittedSeries = debug.fittedSeries ?? [];

  const series = {
    rawSeries: rawSeries.length ? toChartSeries(startMs, rawSeries, baselineMm ?? undefined) : null,
    cleanedSeries: cleanedSeries.length ? toChartSeries(startMs, cleanedSeries, baselineMm ?? undefined) : null,
    smoothedSeries: smoothedSeries.length ? toChartSeries(startMs, smoothedSeries) : null,
    fittedSeries: fittedSeries.length ? toChartSeries(startMs, fittedSeries) : null,
    predictedSeries: null as { recordedAt: string; heightMm: number }[] | null,
  };

  if (prediction?.prediction.predictedSeries?.length) {
    series.predictedSeries = prediction.prediction.predictedSeries.map((p) => ({
      recordedAt: new Date(startMs + p.tMin * 60 * 1000).toISOString(),
      heightMm: Math.round(p.heightMm * 10) / 10,
    }));
  }

  return NextResponse.json({
    cycle: {
      id: cycle.id,
      startedAt: cycle.startedAt.toISOString(),
      endedAt: cycle.endedAt?.toISOString() ?? null,
      status: cycle.status,
    },
    isCurrentCycle,
    analysis: analysis
      ? {
          id: analysis.id,
          isValid: analysis.isValid,
          invalidReason: analysis.invalidReason,
          sampleCountRaw: analysis.sampleCountRaw,
          sampleCountUsed: analysis.sampleCountUsed,
          outlierCount: analysis.outlierCount,
          baselineDistanceMm: analysis.baselineDistanceMm,
          avgAmbientTempC: analysis.avgAmbientTempC,
          avgHumidityPct: analysis.avgHumidityPct,
          fitQuality: analysis.fitQuality,
          amplitudeMm: analysis.amplitudeMm,
          muMinutes: analysis.muMinutes,
          sigmaMinutes: analysis.sigmaMinutes,
          timeToPeakMinutes: analysis.timeToPeakMinutes,
          riseRate: analysis.riseRate,
          decayRate: analysis.decayRate,
          auc: analysis.auc,
          meta: analysis.meta,
        }
      : null,
    prediction: prediction
      ? {
          predictedPeakAt: prediction.prediction.predictedPeakAt.toISOString(),
          predictedPeakStartAt: prediction.prediction.predictedPeakStartAt.toISOString(),
          predictedPeakEndAt: prediction.prediction.predictedPeakEndAt.toISOString(),
          confidence: prediction.prediction.confidence,
          predictedTimeToPeakMinutes: prediction.predictedTimeToPeakMinutes,
          errorMinutes: prediction.prediction.errorMinutes,
        }
      : null,
    series,
  });
  } catch (err) {
    console.error("[cycle-debug] GET error:", err);
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: "Internal server error", ...(process.env.NODE_ENV === "development" && { message }) },
      { status: 500 }
    );
  }
}
