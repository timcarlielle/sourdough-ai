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

/** GET /api/analytics/starter-debug?cycleId=...&modelId=...&includeAnalysis=1 — cycle + model + prediction; optional analysis + series. Debug only. */
export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_STARTER_DEBUG) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const cycleId = searchParams.get("cycleId");
  const modelId = searchParams.get("modelId");
  const includeAnalysis = searchParams.get("includeAnalysis") === "1";

  if (!cycleId) {
    return NextResponse.json({ error: "cycleId required" }, { status: 400 });
  }

  const cycle = await prisma.starterCycle.findFirst({
    where: { id: cycleId, userId },
    include: { sourceFeeding: true },
  });
  if (!cycle) return NextResponse.json({ error: "Cycle not found" }, { status: 404 });

  const model = modelId
    ? await prisma.starterModel.findFirst({
        where: { id: modelId, userId },
        select: { id: true, name: true, trainedOnCycles: true, paramA: true, paramK: true, paramB: true, sigmaBaseMinutes: true, meta: true },
      })
    : await prisma.starterModel.findFirst({
        where: { userId, isActive: true },
        select: { id: true, name: true, trainedOnCycles: true, paramA: true, paramK: true, paramB: true, sigmaBaseMinutes: true, meta: true },
      });

  const prediction = await StarterPredictionService.getPredictionForCycle(prisma, cycle.id);

  const out: Record<string, unknown> = {
    cycle: {
      id: cycle.id,
      startedAt: cycle.startedAt.toISOString(),
      endedAt: cycle.endedAt?.toISOString() ?? null,
      status: cycle.status,
      deviceId: cycle.deviceId,
    },
    model: model
      ? {
          id: model.id,
          name: model.name,
          trainedOnCycles: model.trainedOnCycles,
          paramA: model.paramA,
          paramK: model.paramK,
          paramB: model.paramB,
          sigmaBaseMinutes: model.sigmaBaseMinutes,
          meta: model.meta,
        }
      : null,
    prediction: prediction
      ? {
          predictedPeakAt: prediction.prediction.predictedPeakAt.toISOString(),
          predictedPeakStartAt: prediction.prediction.predictedPeakStartAt.toISOString(),
          predictedPeakEndAt: prediction.prediction.predictedPeakEndAt.toISOString(),
          confidence: prediction.prediction.confidence,
          predictedTimeToPeakMinutes: prediction.predictedTimeToPeakMinutes,
          tempUsedC: prediction.tempUsedC,
          lowTempConfidence: prediction.lowTempConfidence,
          errorMinutes: prediction.prediction.errorMinutes,
        }
      : null,
  };

  if (includeAnalysis) {
    const analysis = await prisma.starterCycleAnalysis.findUnique({
      where: { cycleId: cycle.id },
    });
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
    out.analysis = analysis
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
      : null;
    out.series = series;
  }

  return NextResponse.json(out);
}
