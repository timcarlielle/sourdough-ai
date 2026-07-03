import { describe, it, expect } from "vitest";
import { runAnalysisPipeline, ANALYSIS_CONFIG } from "./starter-cycle-analysis";
import { fitTimeToPeakModel, predictTimeToPeakMinutes, computeConfidence } from "./starter-prediction-service";

const CYCLE_START = new Date("2026-02-20T08:00:00.000Z");

/**
 * Synthetic starter cycle: distance readings every 2 minutes over `spanMinutes`,
 * where height follows a Gaussian rise A*exp(-(t-mu)^2/(2*sigma^2)) above a flat
 * baseline (sensor distance shrinks as the starter rises).
 */
function gaussianCycleReadings(opts: {
  spanMinutes: number;
  baselineMm: number;
  amplitudeMm: number;
  muMinutes: number;
  sigmaMinutes: number;
  tempC?: number;
}) {
  const readings = [];
  for (let t = 0; t <= opts.spanMinutes; t += 2) {
    const height = opts.amplitudeMm * Math.exp(-((t - opts.muMinutes) ** 2) / (2 * opts.sigmaMinutes ** 2));
    readings.push({
      recordedAt: new Date(CYCLE_START.getTime() + t * 60 * 1000),
      distanceMm: opts.baselineMm - height,
      ambientTempC: opts.tempC ?? null,
      ambientHumidityPct: null,
    });
  }
  return readings;
}

function cycle(spanMinutes: number) {
  return {
    startedAt: CYCLE_START,
    endedAt: new Date(CYCLE_START.getTime() + spanMinutes * 60 * 1000),
  };
}

describe("runAnalysisPipeline", () => {
  it("recovers peak time and amplitude from a clean Gaussian rise", () => {
    const result = runAnalysisPipeline(
      cycle(480),
      gaussianCycleReadings({
        spanMinutes: 480,
        baselineMm: 120,
        amplitudeMm: 40,
        muMinutes: 240,
        sigmaMinutes: 80,
        tempC: 22,
      })
    );
    expect(result.isValid).toBe(true);
    expect(result.invalidReason).toBeNull();
    // Peak within one downsample bucket of the true mu
    expect(Math.abs(result.timeToPeakMinutes - 240)).toBeLessThanOrEqual(10);
    expect(result.amplitudeMm).toBeGreaterThan(30);
    expect(result.amplitudeMm).toBeLessThanOrEqual(41);
    expect(result.fitQuality).toBeGreaterThan(0.9);
    expect(result.avgAmbientTempC).toBeCloseTo(22, 5);
  });

  it("rejects cycles with too few points", () => {
    const result = runAnalysisPipeline(
      cycle(30),
      gaussianCycleReadings({ spanMinutes: 30, baselineMm: 120, amplitudeMm: 40, muMinutes: 15, sigmaMinutes: 10 })
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("TOO_FEW_POINTS");
  });

  it("rejects a flat (no-rise) series", () => {
    const flat = [];
    for (let t = 0; t <= 480; t += 2) {
      flat.push({
        recordedAt: new Date(CYCLE_START.getTime() + t * 60 * 1000),
        distanceMm: 120,
        ambientTempC: null,
        ambientHumidityPct: null,
      });
    }
    const result = runAnalysisPipeline(cycle(480), flat);
    expect(result.isValid).toBe(false);
    expect(["PEAK_NOT_FOUND", "AMPLITUDE_TOO_SMALL"]).toContain(result.invalidReason);
  });

  it("rejects a still-rising series with no local peak", () => {
    const result = runAnalysisPipeline(
      cycle(480),
      gaussianCycleReadings({
        spanMinutes: 480,
        baselineMm: 120,
        amplitudeMm: 40,
        muMinutes: 470,
        sigmaMinutes: 120,
      })
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("PEAK_NOT_FOUND");
  });

  it("rejects a peak too close to the cycle end", () => {
    // Local max at ~430 min: inside the data, but in the last 15% of the trimmed span
    const result = runAnalysisPipeline(
      cycle(480),
      gaussianCycleReadings({
        spanMinutes: 480,
        baselineMm: 120,
        amplitudeMm: 40,
        muMinutes: 430,
        sigmaMinutes: 40,
      })
    );
    expect(result.isValid).toBe(false);
    expect(result.invalidReason).toBe("PEAK_AT_BOUNDARY");
  });

  it("drops single-sample spikes as outliers without invalidating the cycle", () => {
    const readings = gaussianCycleReadings({
      spanMinutes: 480,
      baselineMm: 120,
      amplitudeMm: 40,
      muMinutes: 240,
      sigmaMinutes: 80,
    });
    // Sensor glitch: an implausible one-off jump mid-cycle
    readings[60] = { ...readings[60]!, distanceMm: 400 };
    const result = runAnalysisPipeline(cycle(480), readings);
    expect(result.isValid).toBe(true);
    expect(result.outlierCount).toBeGreaterThan(0);
    expect(Math.abs(result.timeToPeakMinutes - 240)).toBeLessThanOrEqual(10);
  });

  it("is deterministic for identical input", () => {
    const readings = gaussianCycleReadings({
      spanMinutes: 480,
      baselineMm: 120,
      amplitudeMm: 40,
      muMinutes: 240,
      sigmaMinutes: 80,
    });
    const a = runAnalysisPipeline(cycle(480), readings, ANALYSIS_CONFIG);
    const b = runAnalysisPipeline(cycle(480), readings, ANALYSIS_CONFIG);
    expect(a).toEqual(b);
  });
});

describe("fitTimeToPeakModel", () => {
  it("returns null with fewer than 3 observations", () => {
    expect(fitTimeToPeakModel([])).toBeNull();
    expect(
      fitTimeToPeakModel([
        { tempC: 20, timeToPeakMinutes: 300 },
        { tempC: 25, timeToPeakMinutes: 200 },
      ])
    ).toBeNull();
  });

  it("fits synthetic observations from a known model with low error", () => {
    // Ground truth: t(T) = 800 * exp(-0.15*T) + 60
    const truth = (T: number) => 800 * Math.exp(-0.15 * T) + 60;
    const observations = [18, 20, 22, 24, 26, 28].map((tempC) => ({
      tempC,
      timeToPeakMinutes: truth(tempC),
    }));
    const fit = fitTimeToPeakModel(observations);
    expect(fit).not.toBeNull();
    expect(fit!.rmse).toBeLessThan(15);
    // Warmer → faster peak, as fitted
    const warm = fit!.a * Math.exp(-fit!.k * 28) + fit!.b;
    const cool = fit!.a * Math.exp(-fit!.k * 18) + fit!.b;
    expect(warm).toBeLessThan(cool);
  });
});

describe("predictTimeToPeakMinutes", () => {
  it("returns null when the model is untrained", () => {
    expect(predictTimeToPeakMinutes(22, null, 0.15, 60)).toBeNull();
    expect(predictTimeToPeakMinutes(22, 800, null, 60)).toBeNull();
    expect(predictTimeToPeakMinutes(22, 800, 0.15, null)).toBeNull();
  });

  it("clamps predictions to [30, 1440] minutes", () => {
    expect(predictTimeToPeakMinutes(40, 1, 0.5, 0)).toBe(30);
    expect(predictTimeToPeakMinutes(0, 100000, 0.15, 60)).toBe(24 * 60);
  });

  it("predicts faster peaks at warmer temperatures", () => {
    const warm = predictTimeToPeakMinutes(28, 800, 0.15, 60)!;
    const cool = predictTimeToPeakMinutes(18, 800, 0.15, 60)!;
    expect(warm).toBeLessThan(cool);
  });
});

describe("computeConfidence", () => {
  it("stays within [0.1, 1]", () => {
    expect(computeConfidence(0, null)).toBeGreaterThanOrEqual(0.1);
    expect(computeConfidence(100, 0)).toBeLessThanOrEqual(1);
  });

  it("grows with training cycles and shrinks with error", () => {
    expect(computeConfidence(10, null)).toBeGreaterThan(computeConfidence(3, null));
    expect(computeConfidence(10, 60)).toBeLessThan(computeConfidence(10, 0));
  });
});
