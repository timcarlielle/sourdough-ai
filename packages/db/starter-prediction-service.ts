/**
 * Starter Peak Model (v1) and prediction generation.
 * Single source of truth for peak/window; replaces hardcoded StarterCurveParams usage.
 * Model: timeToPeakMinutes(tempC) = a * exp(-k * tempC) + b (TEMP_ONLY).
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import {
  getActiveStarterModel,
  getActiveStarterCycle,
  getOrCreateDefaultStarterModel,
  getStarterCycleAnalysisByCycleId,
} from "./starter-prediction";
import { runAndPersistAnalysis } from "./starter-cycle-analysis";

const MIN_CYCLES_TO_FIT = 3;
/** Minimum cycles with temp data before we expose predictions (no hardcoded fallback). */
export const MIN_CYCLES_FOR_PREDICTION = 3;
const MAX_TRAINING_CYCLES = 30;
const DEFAULT_SIGMA_BASE_MINUTES = 270;
const DEFAULT_AMPLITUDE_MM = 15;
const WINDOW_HALF_WIDTH_MIN_FLOOR = 30;
const TEMP_LOOKBACK_MS = 60 * 60 * 1000;
const PREDICTION_SERIES_STEP_MIN = 15;
const PREDICTION_SERIES_SPAN_MIN = 8 * 60;

export type TrainingResult = {
  trained: boolean;
  modelId: string;
  trainedOnCycles: number;
  paramA: number | null;
  paramK: number | null;
  paramB: number | null;
  sigmaBaseMinutes: number;
  rmse: number | null;
  meta: Record<string, unknown>;
};

/** timeToPeakMinutes(tempC) = a * exp(-k * tempC) + b. Returns minutes or null when model not trained. */
export function predictTimeToPeakMinutes(
  tempC: number,
  a: number | null,
  k: number | null,
  b: number | null
): number | null {
  if (a == null || k == null || b == null || !Number.isFinite(tempC)) {
    return null;
  }
  const t = a * Math.exp(-k * tempC) + b;
  return Math.max(30, Math.min(24 * 60, t));
}

/** Fit timeToPeak = a*exp(-k*T)+b via grid search over k,b and linear regression for a. */
export function fitTimeToPeakModel(
  observations: { tempC: number; timeToPeakMinutes: number }[]
): {
  a: number;
  k: number;
  b: number;
  rmse: number;
  n: number;
} | null {
  if (observations.length < MIN_CYCLES_TO_FIT) return null;
  const temps = observations.map((o) => o.tempC);
  const times = observations.map((o) => o.timeToPeakMinutes);
  const minTime = Math.min(...times);
  const bCandidates = [Math.max(20, minTime * 0.3), 30, 60];
  const kCandidates: number[] = [];
  for (let k = 0.05; k <= 0.5; k += 0.05) kCandidates.push(k);

  let best = { a: 200, k: 0.15, b: 30, rmse: Infinity, n: observations.length };
  for (const b of bCandidates) {
    for (const k of kCandidates) {
      const x = temps.map((t) => Math.exp(-k * t));
      const y = times.map((t) => t - b);
      const n = x.length;
      const sumX = x.reduce((s, v) => s + v, 0);
      const sumY = y.reduce((s, v) => s + v, 0);
      const sumXX = x.reduce((s, v) => s + v * v, 0);
      const sumXY = x.reduce((s, _, i) => s + x[i]! * y[i]!, 0);
      const denom = n * sumXX - sumX * sumX;
      if (Math.abs(denom) < 1e-10) continue;
      const a = (n * sumXY - sumX * sumY) / denom;
      if (a < 0) continue;
      let ss = 0;
      for (let i = 0; i < n; i++) {
        const pred = a * x[i]! + b;
        ss += (pred - times[i]!) ** 2;
      }
      const rmse = Math.sqrt(ss / n);
      if (rmse < best.rmse) best = { a, k, b, rmse, n: observations.length };
    }
  }
  return best;
}

/** Compute confidence 0–1 from trainedOnCycles and optional rmse. */
export function computeConfidence(trainedOnCycles: number, rmse: number | null): number {
  const cycleFactor = Math.min(1, trainedOnCycles / 15);
  let errorFactor = 1;
  if (rmse != null && trainedOnCycles >= MIN_CYCLES_TO_FIT) {
    const normalized = Math.min(1, rmse / 60);
    errorFactor = 1 - normalized * 0.5;
  }
  return Math.max(0.1, Math.min(1, cycleFactor * errorFactor));
}

/** Generate predicted series for chart: height(t) = A * exp(-(t-mu)^2/(2*sigma^2)). */
function buildPredictedSeries(
  muMinutes: number,
  sigmaMinutes: number,
  amplitudeMm: number
): { tMin: number; heightMm: number }[] {
  const series: { tMin: number; heightMm: number }[] = [];
  for (let t = 0; t <= PREDICTION_SERIES_SPAN_MIN; t += PREDICTION_SERIES_STEP_MIN) {
    const h = amplitudeMm * Math.exp(-((t - muMinutes) ** 2) / (2 * sigmaMinutes ** 2));
    series.push({ tMin: t, heightMm: Math.round(h * 10) / 10 });
  }
  return series;
}

/**
 * Train the active model (or create a new one if locked) from valid cycle analyses.
 */
export async function trainStarterModel(
  prisma: PrismaClient,
  userId: string,
  options?: { intoNewModel?: boolean }
): Promise<TrainingResult> {
  const active = await getActiveStarterModel(prisma, userId);
  const modelToTrain = active ?? (await getOrCreateDefaultStarterModel(prisma, userId));

  const analysesRaw = await prisma.starterCycleAnalysis.findMany({
    where: {
      userId,
      isValid: true,
      avgAmbientTempC: { not: null },
    },
    orderBy: { createdAt: "desc" },
    take: MAX_TRAINING_CYCLES * 2,
    select: {
      avgAmbientTempC: true,
      timeToPeakMinutes: true,
      amplitudeMm: true,
      sigmaMinutes: true,
      meta: true,
    },
  });

  const analyses = analysesRaw
    .filter((a) => (a.meta as Record<string, unknown> | null)?.excludeFromTraining !== true)
    .slice(0, MAX_TRAINING_CYCLES);

  const observations = analyses
    .filter((a) => a.avgAmbientTempC != null && a.timeToPeakMinutes != null)
    .map((a) => ({ tempC: a.avgAmbientTempC!, timeToPeakMinutes: a.timeToPeakMinutes }));

  const fit = fitTimeToPeakModel(observations);
  const amplitudes = analyses.map((a) => a.amplitudeMm).filter((v) => v > 0);
  const medianA = amplitudes.length > 0 ? median(amplitudes) : DEFAULT_AMPLITUDE_MM;
  const sigmas = analyses.map((a) => a.sigmaMinutes).filter((v) => v > 0);
  const sigmaBase = sigmas.length > 0 ? median(sigmas) : DEFAULT_SIGMA_BASE_MINUTES;

  const meta = {
    datasetSize: observations.length,
    rmse: fit?.rmse ?? null,
    lastTrainedAt: new Date().toISOString(),
  } satisfies Prisma.InputJsonObject;

  const isLocked = modelToTrain.isLocked;
  const createNew = options?.intoNewModel === true || isLocked;

  if (createNew && isLocked) {
    await prisma.starterModel.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    const newModel = await prisma.starterModel.create({
      data: {
        userId,
        name: `${modelToTrain.name} (trained ${new Date().toISOString().slice(0, 10)})`,
        isActive: true,
        isLocked: false,
        modelType: "TEMP_ONLY",
        paramA: fit?.a ?? null,
        paramK: fit?.k ?? null,
        paramB: fit?.b ?? null,
        sigmaBaseMinutes: sigmaBase,
        trainedOnCycles: observations.length,
        lastTrainedAt: new Date(),
        meta,
      },
    });
    return {
      trained: (fit?.n ?? 0) >= MIN_CYCLES_TO_FIT,
      modelId: newModel.id,
      trainedOnCycles: observations.length,
      paramA: newModel.paramA,
      paramK: newModel.paramK,
      paramB: newModel.paramB,
      sigmaBaseMinutes: newModel.sigmaBaseMinutes ?? DEFAULT_SIGMA_BASE_MINUTES,
      rmse: fit?.rmse ?? null,
      meta: (newModel.meta as Record<string, unknown>) ?? {},
    };
  }

  if (!isLocked) {
    await prisma.starterModel.update({
      where: { id: modelToTrain.id },
      data: {
        paramA: fit?.a ?? modelToTrain.paramA,
        paramK: fit?.k ?? modelToTrain.paramK,
        paramB: fit?.b ?? modelToTrain.paramB,
        sigmaBaseMinutes: sigmaBase,
        trainedOnCycles: observations.length,
        lastTrainedAt: new Date(),
        meta,
      },
    });
  }

  return {
    trained: (fit?.n ?? 0) >= MIN_CYCLES_TO_FIT,
    modelId: modelToTrain.id,
    trainedOnCycles: observations.length,
    paramA: fit?.a ?? modelToTrain.paramA,
    paramK: fit?.k ?? modelToTrain.paramK,
    paramB: fit?.b ?? modelToTrain.paramB,
    sigmaBaseMinutes: sigmaBase,
    rmse: fit?.rmse ?? null,
    meta,
  };
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Rolling average ambient temp from readings in last hour for device. */
async function getRecentAmbientTemp(
  prisma: PrismaClient,
  userId: string,
  deviceId: string,
  before: Date
): Promise<number | null> {
  const since = new Date(before.getTime() - TEMP_LOOKBACK_MS);
  const rows = await prisma.telemetryReading.findMany({
    where: {
      userId,
      deviceId,
      readingType: "starter",
      recordedAt: { gte: since, lte: before },
      ambientTempC: { not: null },
    },
    select: { ambientTempC: true },
    take: 500,
  });
  const vals = rows.map((r) => r.ambientTempC).filter((v): v is number => v != null && Number.isFinite(v));
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/**
 * Get or create prediction for a specific cycle. Uses analysis temp if cycle completed and analysis exists; else optional tempC or recent readings.
 */
export async function getPredictionForCycle(
  prisma: PrismaClient,
  cycleId: string,
  tempCOverride?: number | null
): Promise<{
  prediction: {
    id: string;
    predictedPeakAt: Date;
    predictedPeakStartAt: Date;
    predictedPeakEndAt: Date;
    confidence: number;
    predictedSeries: { tMin: number; heightMm: number }[] | null;
    errorMinutes: number | null;
  };
  modelId: string;
  predictedTimeToPeakMinutes: number;
  lowTempConfidence?: boolean;
  tempUsedC: number;
} | null> {
  const cycle = await prisma.starterCycle.findUnique({
    where: { id: cycleId },
    include: { sourceFeeding: true },
  });
  if (!cycle) return null;

  let model = await getActiveStarterModel(prisma, cycle.userId);
  if (!model) model = await getOrCreateDefaultStarterModel(prisma, cycle.userId);

  if (model.trainedOnCycles < MIN_CYCLES_FOR_PREDICTION) return null;

  let tempC: number;
  let usedFallbackTemp = false;
  if (tempCOverride != null && Number.isFinite(tempCOverride)) {
    tempC = tempCOverride;
  } else {
    const analysis = await getStarterCycleAnalysisByCycleId(prisma, cycleId);
    if (analysis?.avgAmbientTempC != null) {
      tempC = analysis.avgAmbientTempC;
    } else if (cycle.status === "ACTIVE" && cycle.deviceId) {
      const recent = await getRecentAmbientTemp(prisma, cycle.userId, cycle.deviceId, new Date());
      tempC = recent ?? 22;
      usedFallbackTemp = recent == null;
    } else {
      tempC = 22;
      usedFallbackTemp = true;
    }
  }

  const predictedTimeToPeakMinutes = predictTimeToPeakMinutes(
    tempC,
    model.paramA,
    model.paramK,
    model.paramB
  );
  if (predictedTimeToPeakMinutes == null) return null;

  const sigmaBase = model.sigmaBaseMinutes ?? DEFAULT_SIGMA_BASE_MINUTES;
  const windowHalfWidth = Math.max(WINDOW_HALF_WIDTH_MIN_FLOOR, sigmaBase);

  // All prediction timestamps are UTC (cycle.startedAt from DB is UTC). Store as-is; render in APP_TIMEZONE everywhere.
  const predictedPeakAt = new Date(cycle.startedAt.getTime() + predictedTimeToPeakMinutes * 60 * 1000);
  const predictedPeakStartAt = new Date(predictedPeakAt.getTime() - windowHalfWidth * 60 * 1000);
  const predictedPeakEndAt = new Date(predictedPeakAt.getTime() + windowHalfWidth * 60 * 1000);

  const meta = (model.meta as Record<string, unknown>) ?? {};
  const rmse = (meta.rmse as number) ?? null;
  const confidence = computeConfidence(model.trainedOnCycles, rmse);

  const analysesForA = await prisma.starterCycleAnalysis.findMany({
    where: { userId: cycle.userId, isValid: true, amplitudeMm: { gt: 0 } },
    orderBy: { createdAt: "desc" },
    take: 20,
    select: { amplitudeMm: true },
  });
  const amplitudeMm = analysesForA.length > 0 ? median(analysesForA.map((a) => a.amplitudeMm)) : DEFAULT_AMPLITUDE_MM;
  const predictedSeries = buildPredictedSeries(predictedTimeToPeakMinutes, sigmaBase, amplitudeMm);

  const now = new Date();
  const pred = await prisma.starterPrediction.upsert({
    where: { cycleId_modelId: { cycleId, modelId: model.id } },
    create: {
      userId: cycle.userId,
      cycleId,
      modelId: model.id,
      predictedAt: now,
      predictedPeakAt,
      predictedPeakStartAt,
      predictedPeakEndAt,
      confidence,
      predictedSeries: predictedSeries as unknown as object,
    },
    update: {
      predictedAt: now,
      predictedPeakAt,
      predictedPeakStartAt,
      predictedPeakEndAt,
      confidence,
      predictedSeries: predictedSeries as unknown as object,
    },
  });

  return {
    prediction: {
      id: pred.id,
      predictedPeakAt: pred.predictedPeakAt,
      predictedPeakStartAt: pred.predictedPeakStartAt,
      predictedPeakEndAt: pred.predictedPeakEndAt,
      confidence: pred.confidence,
      predictedSeries: (pred.predictedSeries as { tMin: number; heightMm: number }[]) ?? null,
      errorMinutes: pred.errorMinutes,
    },
    modelId: model.id,
    predictedTimeToPeakMinutes,
    lowTempConfidence: usedFallbackTemp || undefined,
    tempUsedC: tempC,
  };
}

/**
 * Get or create prediction for the current ACTIVE cycle. Uses rolling average temp from last hour.
 */
export async function getPredictionForActiveCycle(
  prisma: PrismaClient,
  userId: string
): Promise<ReturnType<typeof getPredictionForCycle> extends Promise<infer T> ? T : never> {
  const active = await getActiveStarterCycle(prisma, userId);
  if (!active) return null;
  return getPredictionForCycle(prisma, active.id);
}

export type ReadinessStatus = "ok" | "insufficient_data" | "no_cycle" | "no_device";

export type ReadinessResult =
  | { status: "ok"; prediction: NonNullable<Awaited<ReturnType<typeof getPredictionForCycle>>>; message: null; lowTempConfidence?: boolean }
  | { status: Exclude<ReadinessStatus, "ok">; prediction: null; message: string };

/**
 * Single read API for starter readiness. Use this from dashboard, planner, Siri.
 * Returns prediction only when model has enough cycles; otherwise explicit insufficient_data message.
 */
export async function getReadinessForCycle(
  prisma: PrismaClient,
  userId: string,
  options?: { cycleId?: string }
): Promise<ReadinessResult> {
  const cycle = options?.cycleId
    ? await prisma.starterCycle.findFirst({
        where: { id: options.cycleId, userId },
        include: { sourceFeeding: true },
      })
    : await prisma.starterCycle.findFirst({
        where: { userId },
        orderBy: { startedAt: "desc" },
        include: { sourceFeeding: true },
      });

  if (!cycle) {
    return {
      status: "no_cycle",
      prediction: null,
      message: options?.cycleId ? "Starter cycle not found." : "No starter cycle. Add a feeding to get started.",
    };
  }

  const deviceId = cycle.deviceId ?? (cycle as { sourceFeeding?: { deviceId: string | null } }).sourceFeeding?.deviceId ?? null;
  if (!deviceId) {
    return {
      status: "no_device",
      prediction: null,
      message: "This cycle has no starter monitor linked. Link a device to the feeding to see readiness.",
    };
  }

  let model = await getActiveStarterModel(prisma, userId);
  if (!model) model = await getOrCreateDefaultStarterModel(prisma, userId);

  if (model.trainedOnCycles < MIN_CYCLES_FOR_PREDICTION) {
    return {
      status: "insufficient_data",
      prediction: null,
      message: "Insufficient data. Collect 2–3 cycles with temperature data to get predictions.",
    };
  }

  const prediction = await getPredictionForCycle(prisma, cycle.id);
  if (!prediction) {
    return {
      status: "insufficient_data",
      prediction: null,
      message: "Insufficient data. Collect 2–3 cycles with temperature data to get predictions.",
    };
  }

  return { status: "ok", prediction, message: null, lowTempConfidence: prediction.lowTempConfidence };
}

/**
 * After a cycle is completed and analyzed: update prediction error and optionally train.
 */
export async function onCycleCompleted(
  prisma: PrismaClient,
  cycleId: string
): Promise<{ analysisId: string; trained: boolean; errorMinutesUpdated: boolean }> {
  const { analysisId } = await runAndPersistAnalysis(prisma, cycleId);

  const cycle = await prisma.starterCycle.findUnique({
    where: { id: cycleId },
    select: { userId: true, startedAt: true },
  });
  if (!cycle) return { analysisId, trained: false, errorMinutesUpdated: false };

  const model = await getActiveStarterModel(prisma, cycle.userId);
  if (!model) return { analysisId, trained: false, errorMinutesUpdated: false };

  const analysis = await getStarterCycleAnalysisByCycleId(prisma, cycleId);
  const pred = await prisma.starterPrediction.findUnique({
    where: { cycleId_modelId: { cycleId, modelId: model.id } },
    select: { id: true, predictedPeakAt: true },
  });
  let errorMinutesUpdated = false;
  if (analysis && pred && analysis.timeToPeakMinutes != null) {
    const actualPeakAt = new Date(cycle.startedAt.getTime() + analysis.timeToPeakMinutes * 60 * 1000);
    const errorMinutes = (actualPeakAt.getTime() - pred.predictedPeakAt.getTime()) / (60 * 1000);
    await prisma.starterPrediction.update({
      where: { cycleId_modelId: { cycleId, modelId: model.id } },
      data: { errorMinutes },
    });
    errorMinutesUpdated = true;
  }

  const trained = !model.isLocked;
  if (trained) await trainStarterModel(prisma, cycle.userId);

  return { analysisId, trained, errorMinutesUpdated };
}

/**
 * Get predicted time-to-peak and peak window at a given temperature (for planning without a cycle).
 * Returns null if model has insufficient cycles.
 */
export async function getTimeToPeakForTemp(
  prisma: PrismaClient,
  userId: string,
  tempC: number
): Promise<{
  timeToPeakMinutes: number;
  windowHalfWidthMinutes: number;
  confidence: number;
  modelName: string;
} | null> {
  let model = await getActiveStarterModel(prisma, userId);
  if (!model) model = await getOrCreateDefaultStarterModel(prisma, userId);
  if (model.trainedOnCycles < MIN_CYCLES_FOR_PREDICTION) return null;

  const timeToPeakMinutes = predictTimeToPeakMinutes(tempC, model.paramA, model.paramK, model.paramB);
  if (timeToPeakMinutes == null) return null;

  const sigmaBase = model.sigmaBaseMinutes ?? DEFAULT_SIGMA_BASE_MINUTES;
  const windowHalfWidthMinutes = Math.max(WINDOW_HALF_WIDTH_MIN_FLOOR, sigmaBase);
  const meta = (model.meta as Record<string, unknown>) ?? {};
  const rmse = (meta.rmse as number) ?? null;
  const confidence = computeConfidence(model.trainedOnCycles, rmse);

  return {
    timeToPeakMinutes,
    windowHalfWidthMinutes,
    confidence,
    modelName: model.name,
  };
}

/** Single entry point for prediction; use this from endpoints. */
export const StarterPredictionService = {
  getPredictionForCycle,
  getPredictionForActiveCycle,
  getReadinessForCycle,
  getTimeToPeakForTemp,
  trainStarterModel,
  onCycleCompleted,
  MIN_CYCLES_FOR_PREDICTION,
};
