/**
 * Starter cycle analysis pipeline: deterministic cleaning, height proxy, smoothing,
 * validation, and parameter extraction. Produces StarterCycleAnalysis with debug series.
 */
import type { Prisma, PrismaClient } from "@prisma/client";

// --- Config (parameterized for tests / tuning) ---
export const ANALYSIS_CONFIG = {
  downscaleIntervalMinutes: 2,
  trimStartMinutes: 10,
  trimEndMinutes: 10,
  jumpThresholdMm: 30,
  rollingMedianWindow: 5,
  rollingResidualThresholdMm: 15,
  baselineWindowMinutes: 30,
  smoothWindow: 5,
  minPointsAfterCleaning: 20,
  peakBoundaryFraction: 0.15,
  minAmplitudeMm: 5,
  multiPeakRatio: 0.8,
  multiPeakSepMinutes: 45,
  fitQualityMin: 0.3,
} as const;

export type InvalidReason =
  | "TOO_FEW_POINTS"
  | "PEAK_NOT_FOUND"
  | "PEAK_AT_BOUNDARY"
  | "AMPLITUDE_TOO_SMALL"
  | "MULTI_PEAK"
  | "FIT_QUALITY_LOW";

export type RawSeriesPoint = { tMin: number; distanceMm: number; tempC?: number; humidityPct?: number };
export type CleanedSeriesPoint = { tMin: number; distanceMm: number };
export type HeightSeriesPoint = { tMin: number; heightMm: number };

export type DebugSeries = {
  rawSeries: RawSeriesPoint[];
  cleanedSeries: CleanedSeriesPoint[];
  smoothedSeries: HeightSeriesPoint[];
  fittedSeries: HeightSeriesPoint[];
};

export type AnalysisResult = {
  isValid: boolean;
  invalidReason: InvalidReason | null;
  trimStartMinutes: number;
  trimEndMinutes: number;
  sampleCountRaw: number;
  sampleCountUsed: number;
  outlierCount: number;
  baselineDistanceMm: number;
  avgAmbientTempC: number | null;
  avgHumidityPct: number | null;
  fitQuality: number;
  amplitudeMm: number;
  muMinutes: number;
  sigmaMinutes: number;
  timeToPeakMinutes: number;
  riseRate: number | null;
  decayRate: number | null;
  auc: number | null;
  debugSeries: DebugSeries;
  meta: Record<string, unknown>;
};

type ReadingRow = { recordedAt: Date; distanceMm: number | null; ambientTempC?: number | null; ambientHumidityPct?: number | null };

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const m = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[m]! : (sorted[m - 1]! + sorted[m]!) / 2;
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Downsample to fixed interval using median for distance, mean for temp/humidity. */
function downsample(
  readings: ReadingRow[],
  startMs: number,
  intervalMinutes: number
): RawSeriesPoint[] {
  const bucketMs = intervalMinutes * 60 * 1000;
  const byBucket = new Map<number, { distance: number[]; temp: number[]; humidity: number[] }>();
  for (const r of readings) {
    const t = r.recordedAt.getTime();
    const d = r.distanceMm;
    if (d == null || !Number.isFinite(d)) continue;
    const bucket = Math.floor((t - startMs) / bucketMs) * bucketMs + startMs;
    const tMin = (bucket - startMs) / (60 * 1000);
    if (!byBucket.has(bucket)) byBucket.set(bucket, { distance: [], temp: [], humidity: [] });
    const b = byBucket.get(bucket)!;
    b.distance.push(d);
    if (r.ambientTempC != null && Number.isFinite(r.ambientTempC)) b.temp.push(r.ambientTempC);
    if (r.ambientHumidityPct != null && Number.isFinite(r.ambientHumidityPct)) b.humidity.push(r.ambientHumidityPct);
  }
  const out: RawSeriesPoint[] = [];
  for (const [bucket, b] of [...byBucket.entries()].sort((a, b) => a[0] - b[0])) {
    if (b.distance.length === 0) continue;
    const tMin = (bucket - startMs) / (60 * 1000);
    out.push({
      tMin,
      distanceMm: median(b.distance),
      tempC: b.temp.length ? mean(b.temp) : undefined,
      humidityPct: b.humidity.length ? mean(b.humidity) : undefined,
    });
  }
  return out;
}

/** Trim first and last N minutes. */
function trim(
  series: RawSeriesPoint[],
  trimStart: number,
  trimEnd: number,
  totalSpanMinutes: number
): RawSeriesPoint[] {
  const tEnd = totalSpanMinutes - trimEnd;
  return series.filter((p) => p.tMin >= trimStart && p.tMin <= tEnd);
}

/** Remove invalid distance (<=0 or non-finite). */
function removeInvalid(series: RawSeriesPoint[]): CleanedSeriesPoint[] {
  return series
    .filter((p) => p.distanceMm > 0 && Number.isFinite(p.distanceMm))
    .map((p) => ({ tMin: p.tMin, distanceMm: p.distanceMm }));
}

/** Outliers: implausible jump within 1 bucket, then rolling median residual. */
function removeOutliers(
  series: CleanedSeriesPoint[],
  jumpThreshold: number,
  window: number,
  residualThreshold: number
): { series: CleanedSeriesPoint[]; outlierCount: number } {
  if (series.length < 2) return { series, outlierCount: 0 };
  const sorted = [...series].sort((a, b) => a.tMin - b.tMin);
  let dropped = 0;
  const afterJump: CleanedSeriesPoint[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const curr = sorted[i]!;
    const prev = i > 0 ? sorted[i - 1] : null;
    if (prev != null && Math.abs(curr.distanceMm - prev.distanceMm) > jumpThreshold) {
      dropped++;
      continue;
    }
    afterJump.push(curr);
  }
  const half = Math.floor(window / 2);
  const afterResidual: CleanedSeriesPoint[] = [];
  for (let i = 0; i < afterJump.length; i++) {
    const slice = afterJump.slice(Math.max(0, i - half), Math.min(afterJump.length, i + half + 1));
    const med = median(slice.map((p) => p.distanceMm));
    if (Math.abs(afterJump[i]!.distanceMm - med) <= residualThreshold) {
      afterResidual.push(afterJump[i]!);
    } else {
      dropped++;
    }
  }
  return { series: afterResidual, outlierCount: dropped };
}

/** Baseline = median distance in first 30 min of cleaned data; heightMm = baseline - distance. */
function toHeightSeries(
  series: CleanedSeriesPoint[],
  baselineWindowMinutes: number
): { baselineDistanceMm: number; heightSeries: HeightSeriesPoint[] } {
  const inWindow = series.filter((p) => p.tMin <= baselineWindowMinutes);
  const baselineDistanceMm = inWindow.length > 0 ? median(inWindow.map((p) => p.distanceMm)) : series[0]?.distanceMm ?? 0;
  const heightSeries: HeightSeriesPoint[] = series.map((p) => ({
    tMin: p.tMin,
    heightMm: baselineDistanceMm - p.distanceMm,
  }));
  return { baselineDistanceMm, heightSeries };
}

/** Rolling median then rolling mean (window size). */
function smooth(series: HeightSeriesPoint[], window: number): HeightSeriesPoint[] {
  if (series.length === 0) return [];
  const half = Math.floor(window / 2);
  const medianPass = series.map((_, i) => {
    const slice = series.slice(Math.max(0, i - half), Math.min(series.length, i + half + 1));
    return { tMin: series[i]!.tMin, heightMm: median(slice.map((p) => p.heightMm)) };
  });
  const meanPass = medianPass.map((_, i) => {
    const slice = medianPass.slice(Math.max(0, i - half), Math.min(medianPass.length, i + half + 1));
    return { tMin: medianPass[i]!.tMin, heightMm: mean(slice.map((p) => p.heightMm)) };
  });
  return meanPass;
}

/** Local maximum: point greater than both neighbors. */
function findPeaks(series: HeightSeriesPoint[]): number[] {
  const peaks: number[] = [];
  for (let i = 1; i < series.length - 1; i++) {
    const y = series[i]!.heightMm;
    if (y > series[i - 1]!.heightMm && y > series[i + 1]!.heightMm) peaks.push(i);
  }
  return peaks;
}

/** Validation rules; returns first invalid reason or null if valid. */
function validate(
  smoothed: HeightSeriesPoint[],
  config: typeof ANALYSIS_CONFIG
): { isValid: boolean; invalidReason: InvalidReason | null } {
  if (smoothed.length < config.minPointsAfterCleaning) {
    return { isValid: false, invalidReason: "TOO_FEW_POINTS" };
  }
  const peaks = findPeaks(smoothed);
  if (peaks.length === 0) {
    return { isValid: false, invalidReason: "PEAK_NOT_FOUND" };
  }
  const maxHeight = Math.max(...smoothed.map((p) => p.heightMm));
  if (maxHeight < config.minAmplitudeMm) {
    return { isValid: false, invalidReason: "AMPLITUDE_TOO_SMALL" };
  }
  const span = smoothed.length > 0 ? smoothed[smoothed.length - 1]!.tMin - smoothed[0]!.tMin : 0;
  const peakIndices = peaks.map((i) => ({ i, tMin: smoothed[i]!.tMin, height: smoothed[i]!.heightMm }));
  const mainPeak = peakIndices.reduce((best, p) => (p.height > best.height ? p : best), peakIndices[0]!);
  const tStart = smoothed[0]!.tMin;
  const tEnd = smoothed[smoothed.length - 1]!.tMin;
  if (span > 0) {
    const frac = (mainPeak.tMin - tStart) / span;
    if (frac < config.peakBoundaryFraction || frac > 1 - config.peakBoundaryFraction) {
      return { isValid: false, invalidReason: "PEAK_AT_BOUNDARY" };
    }
  }
  const aboveThreshold = peakIndices.filter((p) => p.height >= config.multiPeakRatio * maxHeight);
  if (aboveThreshold.length >= 2) {
    for (let a = 0; a < aboveThreshold.length; a++) {
      for (let b = a + 1; b < aboveThreshold.length; b++) {
        if (Math.abs(aboveThreshold[b]!.tMin - aboveThreshold[a]!.tMin) > config.multiPeakSepMinutes) {
          return { isValid: false, invalidReason: "MULTI_PEAK" };
        }
      }
    }
  }
  return { isValid: true, invalidReason: null };
}

/** Extract parameters from smoothed series. */
function extractParams(
  smoothed: HeightSeriesPoint[],
  rawSeries: RawSeriesPoint[]
): {
  timeToPeakMinutes: number;
  amplitudeMm: number;
  muMinutes: number;
  riseRate: number | null;
  decayRate: number | null;
  auc: number | null;
  avgAmbientTempC: number | null;
  avgHumidityPct: number | null;
} {
  let peakIdx = 0;
  let maxH = smoothed[0]?.heightMm ?? 0;
  smoothed.forEach((p, i) => {
    if (p.heightMm > maxH) {
      maxH = p.heightMm;
      peakIdx = i;
    }
  });
  const timeToPeakMinutes = smoothed[peakIdx]?.tMin ?? 0;
  const amplitudeMm = maxH;

  let riseRate: number | null = null;
  let decayRate: number | null = null;
  if (peakIdx >= 2) {
    const before = smoothed.slice(Math.max(0, peakIdx - 3), peakIdx + 1);
    if (before.length >= 2) {
      const dt = (before[before.length - 1]!.tMin - before[0]!.tMin) * 60;
      if (dt > 0) riseRate = (before[before.length - 1]!.heightMm - before[0]!.heightMm) / dt;
    }
  }
  if (peakIdx < smoothed.length - 2) {
    const after = smoothed.slice(peakIdx, Math.min(smoothed.length, peakIdx + 4));
    if (after.length >= 2) {
      const dt = (after[after.length - 1]!.tMin - after[0]!.tMin) * 60;
      if (dt > 0) decayRate = (after[after.length - 1]!.heightMm - after[0]!.heightMm) / dt;
    }
  }

  let auc: number | null = null;
  if (smoothed.length >= 2) {
    let sum = 0;
    for (let i = 1; i < smoothed.length; i++) {
      const dt = (smoothed[i]!.tMin - smoothed[i - 1]!.tMin) * 60;
      sum += ((smoothed[i]!.heightMm + smoothed[i - 1]!.heightMm) / 2) * dt;
    }
    auc = sum;
  }

  const temps = rawSeries.map((p) => p.tempC).filter((t): t is number => t != null && Number.isFinite(t));
  const humids = rawSeries.map((p) => p.humidityPct).filter((h): h is number => h != null && Number.isFinite(h));
  return {
    timeToPeakMinutes,
    amplitudeMm,
    muMinutes: timeToPeakMinutes,
    riseRate,
    decayRate,
    auc,
    avgAmbientTempC: temps.length ? mean(temps) : null,
    avgHumidityPct: humids.length ? mean(humids) : null,
  };
}

/** Simple Gaussian fit: heightMm ≈ A * exp(-(t - mu)^2 / (2*sigma^2)). Returns A, mu, sigma and R². */
function gaussianFit(series: HeightSeriesPoint[]): {
  A: number;
  mu: number;
  sigma: number;
  r2: number;
  fitted: HeightSeriesPoint[];
} {
  const n = series.length;
  if (n < 5) {
    return { A: 0, mu: 0, sigma: 60, r2: 0, fitted: series.map((p) => ({ ...p, heightMm: 0 })) };
  }
  const maxPt = series.reduce((best, p) => (p.heightMm > best.heightMm ? p : best), series[0]!);
  let A = maxPt.heightMm;
  let mu = maxPt.tMin;
  const peakIdx = series.findIndex((p) => p.tMin === mu);
  const idx = peakIdx >= 0 ? peakIdx : Math.floor(series.length / 2);
  let sigma = 60;
  const span = series[n - 1]!.tMin - series[0]!.tMin;
  if (span > 0) {
    const halfA = A * 0.5;
    let halfRight = span;
    for (let i = idx; i < n; i++) {
      if (series[i]!.heightMm <= halfA) {
        halfRight = series[i]!.tMin - mu;
        break;
      }
    }
    let halfLeft = span;
    for (let i = idx; i >= 0; i--) {
      if (series[i]!.heightMm <= halfA) {
        halfLeft = mu - series[i]!.tMin;
        break;
      }
    }
    const halfWidth = (halfLeft + halfRight) / 2;
    if (halfWidth > 0) sigma = halfWidth / 1.35;
    if (sigma < 5) sigma = 5;
    if (sigma > 300) sigma = 300;
  }
  const y = series.map((p) => p.heightMm);
  const yMean = mean(y);
  let ssTot = 0;
  for (let i = 0; i < n; i++) ssTot += (y[i]! - yMean) ** 2;
  if (ssTot === 0) {
    return {
      A,
      mu,
      sigma,
      r2: 1,
      fitted: series.map((p) => ({ tMin: p.tMin, heightMm: A * Math.exp(-((p.tMin - mu) ** 2) / (2 * sigma ** 2)) })),
    };
  }
  const fit = (t: number) => A * Math.exp(-((t - mu) ** 2) / (2 * sigma ** 2));
  let ssRes = 0;
  for (let i = 0; i < n; i++) ssRes += (y[i]! - fit(series[i]!.tMin)) ** 2;
  const r2 = 1 - ssRes / ssTot;
  const fitted: HeightSeriesPoint[] = series.map((p) => ({ tMin: p.tMin, heightMm: fit(p.tMin) }));
  return { A, mu, sigma, r2, fitted };
}

/**
 * Run the full pipeline on a cycle and its readings. Deterministic.
 */
export function runAnalysisPipeline(
  cycle: { startedAt: Date; endedAt: Date | null },
  readings: ReadingRow[],
  config: typeof ANALYSIS_CONFIG = ANALYSIS_CONFIG
): AnalysisResult {
  const startMs = cycle.startedAt.getTime();
  const endMs = (cycle.endedAt ?? new Date()).getTime();
  const totalSpanMinutes = (endMs - startMs) / (60 * 1000);

  const rawSeries = downsample(readings, startMs, config.downscaleIntervalMinutes);
  const sampleCountRaw = rawSeries.length;

  const trimmed = trim(rawSeries, config.trimStartMinutes, config.trimEndMinutes, totalSpanMinutes);
  const cleanedNoOutliers = removeInvalid(trimmed);
  const { series: cleanedSeries, outlierCount } = removeOutliers(
    cleanedNoOutliers,
    config.jumpThresholdMm,
    config.rollingMedianWindow,
    config.rollingResidualThresholdMm
  );
  const sampleCountUsed = cleanedSeries.length;

  const { baselineDistanceMm, heightSeries } = toHeightSeries(cleanedSeries, config.baselineWindowMinutes);
  const smoothedSeries = smooth(heightSeries, config.smoothWindow);

  const { isValid, invalidReason } = validate(smoothedSeries, config);
  const params = extractParams(smoothedSeries, rawSeries);

  let fitQuality = 0;
  let fittedSeries = smoothedSeries;
  let sigmaMinutes = 60;
  if (smoothedSeries.length >= 5) {
    const fit = gaussianFit(smoothedSeries);
    fitQuality = Math.max(0, fit.r2);
    fittedSeries = fit.fitted;
    sigmaMinutes = fit.sigma;
  }

  let finalValid = isValid;
  let finalReason = invalidReason;
  if (isValid && invalidReason === null && fitQuality < config.fitQualityMin) {
    finalValid = false;
    finalReason = "FIT_QUALITY_LOW";
  }

  return {
    isValid: finalValid,
    invalidReason: finalReason,
    trimStartMinutes: config.trimStartMinutes,
    trimEndMinutes: config.trimEndMinutes,
    sampleCountRaw,
    sampleCountUsed,
    outlierCount,
    baselineDistanceMm,
    avgAmbientTempC: params.avgAmbientTempC,
    avgHumidityPct: params.avgHumidityPct,
    fitQuality,
    amplitudeMm: params.amplitudeMm,
    muMinutes: params.muMinutes,
    sigmaMinutes,
    timeToPeakMinutes: params.timeToPeakMinutes,
    riseRate: params.riseRate,
    decayRate: params.decayRate,
    auc: params.auc,
    debugSeries: { rawSeries, cleanedSeries, smoothedSeries, fittedSeries },
    meta: {},
  };
}

/**
 * Load cycle + readings, run pipeline, and persist StarterCycleAnalysis.
 * Idempotent: upserts by cycleId (one analysis per cycle).
 */
export async function runAndPersistAnalysis(
  prisma: PrismaClient,
  cycleId: string
): Promise<{ analysisId: string }> {
  const cycle = await prisma.starterCycle.findUnique({
    where: { id: cycleId },
    include: { sourceFeeding: true },
  });
  if (!cycle) throw new Error(`StarterCycle not found: ${cycleId}`);
  if (cycle.status !== "COMPLETED") {
    throw new Error(`Cycle ${cycleId} is not COMPLETED (status: ${cycle.status}). Analysis only runs on COMPLETED cycles.`);
  }

  const deviceId = cycle.deviceId ?? cycle.sourceFeeding?.deviceId ?? null;
  if (!deviceId) throw new Error(`Cycle ${cycleId} has no device; cannot load readings.`);

  const endAt = cycle.endedAt ?? new Date();
  const readings = await prisma.telemetryReading.findMany({
    where: {
      userId: cycle.userId,
      deviceId,
      readingType: "starter",
      recordedAt: { gte: cycle.startedAt, lte: endAt },
    },
    orderBy: { recordedAt: "asc" },
    select: { recordedAt: true, distanceMm: true, ambientTempC: true, ambientHumidityPct: true },
  });

  const rows: ReadingRow[] = readings.map((r) => ({
    recordedAt: r.recordedAt,
    distanceMm: r.distanceMm ?? 0,
    ambientTempC: r.ambientTempC,
    ambientHumidityPct: r.ambientHumidityPct,
  }));

  const result = runAnalysisPipeline(cycle, rows);

  const debugSeries = result.debugSeries as unknown as Prisma.InputJsonObject;
  const meta = result.meta as Prisma.InputJsonObject;
  await prisma.starterCycleAnalysis.upsert({
    where: { cycleId },
    create: {
      userId: cycle.userId,
      cycleId,
      isValid: result.isValid,
      invalidReason: result.invalidReason,
      trimStartMinutes: result.trimStartMinutes,
      trimEndMinutes: result.trimEndMinutes,
      sampleCountRaw: result.sampleCountRaw,
      sampleCountUsed: result.sampleCountUsed,
      outlierCount: result.outlierCount,
      baselineDistanceMm: result.baselineDistanceMm,
      avgAmbientTempC: result.avgAmbientTempC,
      avgHumidityPct: result.avgHumidityPct,
      fitQuality: result.fitQuality,
      amplitudeMm: result.amplitudeMm,
      muMinutes: result.muMinutes,
      sigmaMinutes: result.sigmaMinutes,
      timeToPeakMinutes: result.timeToPeakMinutes,
      riseRate: result.riseRate,
      decayRate: result.decayRate,
      auc: result.auc,
      debugSeries,
      meta,
    },
    update: {
      isValid: result.isValid,
      invalidReason: result.invalidReason,
      trimStartMinutes: result.trimStartMinutes,
      trimEndMinutes: result.trimEndMinutes,
      sampleCountRaw: result.sampleCountRaw,
      sampleCountUsed: result.sampleCountUsed,
      outlierCount: result.outlierCount,
      baselineDistanceMm: result.baselineDistanceMm,
      avgAmbientTempC: result.avgAmbientTempC,
      avgHumidityPct: result.avgHumidityPct,
      fitQuality: result.fitQuality,
      amplitudeMm: result.amplitudeMm,
      muMinutes: result.muMinutes,
      sigmaMinutes: result.sigmaMinutes,
      timeToPeakMinutes: result.timeToPeakMinutes,
      riseRate: result.riseRate,
      decayRate: result.decayRate,
      auc: result.auc,
      debugSeries,
      meta,
    },
  });

  const analysis = await prisma.starterCycleAnalysis.findUnique({
    where: { cycleId },
    select: { id: true },
  });
  return { analysisId: analysis!.id };
}
