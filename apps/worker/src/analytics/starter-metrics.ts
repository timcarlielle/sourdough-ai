/**
 * Starter state detection and derived metrics from rise curve (distanceMm over time).
 * Uses simple rules: find peak, compute slopes, classify state.
 * Pass peakWindowMinutes from StarterPredictionService.getTimeToPeakForTemp when available
 * so "peak" classification aligns with the model's window.
 */

export type StarterState =
  | "dormant"
  | "waking"
  | "rising"
  | "peak"
  | "post_peak"
  | "collapsed";

export type StarterCycleMetrics = {
  timeToPeakMinutes: number | null;
  peakHeightMm: number | null;
  growthRatePerHour: number | null; // mm/h before peak
  declineRatePerHour: number | null; // mm/h after peak (positive = declining)
  state: StarterState;
  activityScore: number; // 0–1 normalized
  peakIndex: number | null;
  sampleCount: number;
};

export type StarterMetricsOptions = {
  /** Half-width of peak window in minutes (from StarterPredictionService). When set, "peak" state uses this. */
  peakWindowMinutes?: number;
};

type Point = { recordedAt: Date; distanceMm: number | null };

const MIN_POINTS_FOR_PEAK = 3;
const DEFAULT_PEAK_WINDOW_MINUTES = 30;
const SLOPE_MINUTES = 20; // window for growth/decline slope

function getMm(p: Point): number {
  return p.distanceMm ?? 0;
}

function findPeakIndex(points: Point[]): number | null {
  const withMm = points
    .map((p, i) => ({ i, t: p.recordedAt.getTime(), mm: getMm(p) }))
    .filter((x) => x.mm > 0);
  if (withMm.length < MIN_POINTS_FOR_PEAK) return null;
  let maxIdx = withMm[0].i;
  let maxMm = withMm[0].mm;
  withMm.forEach((x) => {
    if (x.mm > maxMm) {
      maxMm = x.mm;
      maxIdx = x.i;
    }
  });
  return maxIdx;
}

function slopeMmPerHour(points: Point[], fromIndex: number, toIndex: number): number | null {
  if (fromIndex < 0 || toIndex >= points.length || fromIndex >= toIndex) return null;
  const a = points[fromIndex];
  const b = points[toIndex];
  const ma = getMm(a);
  const mb = getMm(b);
  const dtHours = (b.recordedAt.getTime() - a.recordedAt.getTime()) / (1000 * 60 * 60);
  if (dtHours <= 0) return null;
  return (mb - ma) / dtHours;
}

/**
 * Classify state from position relative to peak and growth/decline rates.
 */
function classifyState(
  points: Point[],
  peakIndex: number | null,
  growthRate: number | null,
  declineRate: number | null,
  nowTime: number,
  peakWindowMinutes: number
): StarterState {
  if (points.length < 2) return "dormant";
  if (peakIndex == null) {
    const last = getMm(points[points.length - 1]);
    if (last > 0) return "rising"; // no peak yet but we have rise
    return "dormant";
  }

  const peakTime = points[peakIndex].recordedAt.getTime();
  const peakMm = getMm(points[peakIndex]);
  const lastPoint = points[points.length - 1];
  const lastMm = getMm(lastPoint);
  const lastTime = lastPoint.recordedAt.getTime();

  if (lastTime < peakTime) {
    if (growthRate != null && growthRate > 0.5) return "rising";
    if (growthRate != null && growthRate > 0) return "waking";
    return "dormant";
  }

  const minutesPastPeak = (lastTime - peakTime) / (1000 * 60);
  if (minutesPastPeak <= peakWindowMinutes) return "peak";
  if (declineRate != null && declineRate > 2 && lastMm < peakMm * 0.5) return "collapsed";
  if (declineRate != null && lastMm < peakMm * 0.85) return "post_peak";
  return "post_peak";
}

/**
 * Compute derived metrics from a time-ordered list of starter telemetry points.
 * Pass options.peakWindowMinutes from StarterPredictionService.getTimeToPeakForTemp when available.
 */
export function computeStarterMetrics(
  points: Point[],
  options?: { now?: Date; peakWindowMinutes?: number }
): StarterCycleMetrics {
  const now = options?.now ?? new Date();
  const peakWindowMinutes = options?.peakWindowMinutes ?? DEFAULT_PEAK_WINDOW_MINUTES;
  const nowTime = now.getTime();
  const sorted = [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
  const peakIndex = findPeakIndex(sorted);

  let timeToPeakMinutes: number | null = null;
  let peakHeightMm: number | null = null;
  let growthRatePerHour: number | null = null;
  let declineRatePerHour: number | null = null;

  if (peakIndex != null && sorted.length > 0) {
    peakHeightMm = getMm(sorted[peakIndex]);
    const startTime = sorted[0].recordedAt.getTime();
    timeToPeakMinutes = (sorted[peakIndex].recordedAt.getTime() - startTime) / (1000 * 60);

    const beforeStart = Math.max(0, peakIndex - Math.ceil((SLOPE_MINUTES / (timeToPeakMinutes || 1)) * (sorted.length / 60)));
    growthRatePerHour = slopeMmPerHour(sorted, beforeStart, peakIndex);

    const afterEnd = Math.min(sorted.length - 1, peakIndex + 5);
    if (afterEnd > peakIndex) {
      declineRatePerHour = slopeMmPerHour(sorted, peakIndex, afterEnd);
      if (declineRatePerHour != null) declineRatePerHour = -declineRatePerHour; // positive = decline
    }
  }

  const state = classifyState(
    sorted,
    peakIndex,
    growthRatePerHour,
    declineRatePerHour,
    nowTime,
    peakWindowMinutes
  );

  let activityScore = 0;
  if (peakHeightMm != null && peakHeightMm > 0) {
    const lastMm = sorted.length ? getMm(sorted[sorted.length - 1]) : 0;
    if (state === "peak") activityScore = 1;
    else if (state === "rising" || state === "post_peak") activityScore = 0.5 + Math.min(0.5, (lastMm / peakHeightMm) * 0.5);
    else if (state === "waking") activityScore = 0.3;
  }

  return {
    timeToPeakMinutes,
    peakHeightMm,
    growthRatePerHour,
    declineRatePerHour,
    state,
    activityScore,
    peakIndex,
    sampleCount: sorted.length,
  };
}
