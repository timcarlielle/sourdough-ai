/**
 * Lightweight starter metrics for planning API (peak detection + state).
 * Use peakWindowMinutes from StarterPredictionService (window half-width) when available
 * so "peak" classification aligns with the model's peak window.
 */

export type StarterState =
  | "dormant"
  | "waking"
  | "rising"
  | "peak"
  | "post_peak"
  | "collapsed";

export type StarterMetrics = {
  timeToPeakMinutes: number | null;
  peakHeightMm: number | null;
  growthRatePerHour: number | null;
  state: StarterState;
  activityScore: number;
};

export type StarterMetricsOptions = {
  /** Half-width of peak window in minutes (from StarterPredictionService). When set, "peak" state uses this instead of hardcoded 30. */
  peakWindowMinutes?: number;
};

type Point = { recordedAt: Date | string; distanceMm: number | null };

const DEFAULT_PEAK_WINDOW_MINUTES = 30;

function getMm(p: Point): number {
  return p.distanceMm ?? 0;
}

function parseDate(d: Date | string): Date {
  return typeof d === "string" ? new Date(d) : d;
}

export function computeStarterMetrics(
  points: Point[],
  now?: Date,
  options?: StarterMetricsOptions
): StarterMetrics {
  const peakWindowMinutes = options?.peakWindowMinutes ?? DEFAULT_PEAK_WINDOW_MINUTES;
  const sorted = [...points]
    .filter((p) => getMm(p) > 0)
    .sort((a, b) => parseDate(a.recordedAt).getTime() - parseDate(b.recordedAt).getTime());
  if (sorted.length < 2) {
    return {
      timeToPeakMinutes: null,
      peakHeightMm: null,
      growthRatePerHour: null,
      state: "dormant",
      activityScore: 0,
    };
  }

  let peakIdx = 0;
  let peakMm = getMm(sorted[0]);
  sorted.forEach((p, i) => {
    const m = getMm(p);
    if (m > peakMm) {
      peakMm = m;
      peakIdx = i;
    }
  });

  const startTime = parseDate(sorted[0].recordedAt).getTime();
  const peakTime = parseDate(sorted[peakIdx].recordedAt).getTime();
  const timeToPeakMinutes = (peakTime - startTime) / (1000 * 60);

  let growthRatePerHour: number | null = null;
  if (peakIdx > 0) {
    const dt = (peakTime - startTime) / (1000 * 60 * 60);
    if (dt > 0) growthRatePerHour = (peakMm - getMm(sorted[0])) / dt;
  }

  const last = sorted[sorted.length - 1];
  const lastTime = parseDate(last.recordedAt).getTime();
  const lastMm = getMm(last);
  const nowTime = (now ?? new Date()).getTime();

  let state: StarterState = "dormant";
  if (lastTime < peakTime) {
    state = growthRatePerHour != null && growthRatePerHour > 0.5 ? "rising" : "waking";
  } else {
    const minutesPastPeak = (lastTime - peakTime) / (1000 * 60);
    if (minutesPastPeak <= peakWindowMinutes) state = "peak";
    else if (lastMm < peakMm * 0.5) state = "collapsed";
    else state = "post_peak";
  }

  let activityScore = 0;
  if (peakMm > 0) {
    if (state === "peak") activityScore = 1;
    else if (state === "rising" || state === "post_peak") activityScore = 0.5 + Math.min(0.5, (lastMm / peakMm) * 0.5);
  }

  return {
    timeToPeakMinutes,
    peakHeightMm: peakMm,
    growthRatePerHour,
    state,
    activityScore,
  };
}
