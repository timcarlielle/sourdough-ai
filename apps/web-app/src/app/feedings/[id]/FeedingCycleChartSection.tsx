"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { formatInUserTz } from "@/lib/timezone";
import { CycleDebugChart } from "./CycleDebugChart";

type CycleDebugResponse = {
  cycle: { id: string; startedAt: string; endedAt: string | null; status: string } | null;
  isCurrentCycle?: boolean;
  analysis: {
    id: string;
    isValid: boolean;
    invalidReason: string | null;
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
    meta: Record<string, unknown> | null;
  } | null;
  prediction: {
    predictedPeakAt: string;
    predictedTimeToPeakMinutes: number;
    errorMinutes: number | null;
  } | null;
  series: {
    rawSeries: { recordedAt: string; heightMm: number }[] | null;
    cleanedSeries: { recordedAt: string; heightMm: number }[] | null;
    smoothedSeries: { recordedAt: string; heightMm: number }[] | null;
    fittedSeries: { recordedAt: string; heightMm: number }[] | null;
    predictedSeries: { recordedAt: string; heightMm: number }[] | null;
  };
};

const SERIES_KEYS = ["rawSeries", "cleanedSeries", "smoothedSeries", "fittedSeries", "predictedSeries"] as const;

export function FeedingCycleChartSection({
  feedingId,
  userTimezone,
}: {
  feedingId: string;
  userTimezone: string;
}) {
  const [data, setData] = useState<CycleDebugResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState<Record<string, boolean>>({
    rawSeries: false,
    cleanedSeries: true,
    smoothedSeries: true,
    fittedSeries: true,
    predictedSeries: true,
  });
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchDebug = useCallback(() => {
    setLoading(true);
    fetch(`/api/feedings/${feedingId}/cycle-debug`)
      .then((r) => r.json())
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [feedingId]);

  useEffect(() => {
    fetchDebug();
  }, [fetchDebug]);

  async function handleRerun() {
    setActionLoading("rerun");
    try {
      const res = await fetch(`/api/feedings/${feedingId}/cycle-analysis/rerun`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      fetchDebug();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Re-run failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleMarkValid(valid: boolean) {
    setActionLoading(valid ? "valid" : "invalid");
    try {
      const res = await fetch(`/api/feedings/${feedingId}/cycle-analysis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isValid: valid }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      fetchDebug();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionLoading(null);
    }
  }

  async function handleExcludeFromTraining(exclude: boolean) {
    setActionLoading("exclude");
    try {
      const res = await fetch(`/api/feedings/${feedingId}/cycle-analysis`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ excludeFromTraining: exclude }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? "Failed");
      fetchDebug();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Update failed");
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50/50 p-4">
        <p className="text-sm text-stone-500">Loading cycle debug…</p>
      </div>
    );
  }

  if (!data?.cycle) {
    return (
      <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50/50 p-4">
        <p className="text-sm text-stone-500">No cycle data for this feeding.</p>
      </div>
    );
  }

  const cycle = data.cycle;
  const isCurrentCycle = data.isCurrentCycle === true;

  if (isCurrentCycle) {
    return (
      <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50/50 p-4">
        <p className="text-sm font-medium text-amber-900">This is the current cycle</p>
        <p className="mt-1 text-sm text-stone-600">
          View live fermentation progress on the{" "}
          <Link href="/" className="font-medium text-amber-800 underline hover:no-underline">
            Dashboard
          </Link>
          .
        </p>
      </div>
    );
  }

  const hasAnySeries =
    (data.series?.rawSeries?.length ?? 0) > 0 ||
    (data.series?.cleanedSeries?.length ?? 0) > 0 ||
    (data.series?.smoothedSeries?.length ?? 0) > 0 ||
    (data.series?.fittedSeries?.length ?? 0) > 0 ||
    (data.series?.predictedSeries?.length ?? 0) > 0;

  const excludedFromTraining = (data.analysis?.meta as Record<string, unknown> | null)?.excludeFromTraining === true;

  return (
    <div className="mt-6 space-y-6">
      {/* Fermentation progress — multi-series toggles */}
      <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-medium text-stone-700">Fermentation progress (debug)</h2>
          <p className="mt-1 text-xs text-stone-500">
            Cycle started {formatInUserTz(cycle.startedAt, userTimezone)}
            {cycle.endedAt && ` • ended ${formatInUserTz(cycle.endedAt, userTimezone)}`}
          </p>
        </div>
        <div className="px-4 py-3">
          <div className="mb-3 flex flex-wrap gap-4">
            {SERIES_KEYS.map((key) => {
              const hasData = (data.series?.[key]?.length ?? 0) > 0;
              return (
                <label key={key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled[key] ?? false}
                    onChange={(e) => setEnabled((prev) => ({ ...prev, [key]: e.target.checked }))}
                    disabled={!hasData}
                    className="rounded border-stone-300"
                  />
                  <span className={hasData ? "text-stone-700" : "text-stone-400"}>
                    {key.replace("Series", "")}
                    {!hasData && " (none)"}
                  </span>
                </label>
              );
            })}
          </div>
          {hasAnySeries ? (
            <CycleDebugChart series={data.series ?? {}} enabled={enabled} height={400} />
          ) : (
            <div className="flex h-[300px] items-center justify-center rounded-lg border border-stone-200 bg-stone-50/50 text-sm text-stone-500">
              No series data. Run analysis (COMPLETED cycles only) or ensure prediction exists.
            </div>
          )}
        </div>
      </div>

      {/* Cycle Analysis debug panel */}
      <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-medium text-stone-700">Cycle Analysis</h2>
        </div>
        <div className="px-4 py-3">
          {data.analysis ? (
            <div className="space-y-4">
              <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
                <dt className="text-stone-500">Validation</dt>
                <dd>
                  <span className={data.analysis.isValid ? "text-emerald-700 font-medium" : "text-amber-700"}>
                    {data.analysis.isValid ? "Valid" : "Invalid"}
                  </span>
                  {data.analysis.invalidReason && (
                    <span className="ml-1 text-stone-500">({data.analysis.invalidReason})</span>
                  )}
                </dd>
                <dt className="text-stone-500">Samples</dt>
                <dd className="font-mono text-stone-800">
                  raw: {data.analysis.sampleCountRaw} → used: {data.analysis.sampleCountUsed}, outliers: {data.analysis.outlierCount}
                </dd>
                <dt className="text-stone-500">Baseline</dt>
                <dd className="font-mono text-stone-800">{data.analysis.baselineDistanceMm.toFixed(1)} mm</dd>
                <dt className="text-stone-500">Avg temp / humidity</dt>
                <dd className="font-mono text-stone-800">
                  {data.analysis.avgAmbientTempC != null ? `${data.analysis.avgAmbientTempC.toFixed(1)}°C` : "—"} /{" "}
                  {data.analysis.avgHumidityPct != null ? `${data.analysis.avgHumidityPct.toFixed(1)}%` : "—"}
                </dd>
                <dt className="text-stone-500">Extracted</dt>
                <dd className="font-mono text-stone-800">
                  A={data.analysis.amplitudeMm.toFixed(1)} μ={data.analysis.muMinutes.toFixed(0)}min σ={data.analysis.sigmaMinutes.toFixed(0)}min
                  timeToPeak={data.analysis.timeToPeakMinutes.toFixed(0)}min
                </dd>
                <dt className="text-stone-500">Rise / decay / AUC</dt>
                <dd className="font-mono text-stone-800">
                  {data.analysis.riseRate?.toFixed(4) ?? "—"} / {data.analysis.decayRate?.toFixed(4) ?? "—"} / {data.analysis.auc?.toFixed(1) ?? "—"}
                </dd>
                <dt className="text-stone-500">Fit quality</dt>
                <dd className="font-mono text-stone-800">{data.analysis.fitQuality.toFixed(3)}</dd>
                {data.prediction && data.analysis && (
                  <>
                    <dt className="text-stone-500">Actual vs predicted time-to-peak</dt>
                    <dd className="font-mono text-stone-800">
                      actual: {data.analysis.timeToPeakMinutes.toFixed(0)} min, predicted: {data.prediction.predictedTimeToPeakMinutes.toFixed(0)} min
                      {data.prediction.errorMinutes != null && (
                        <span className="ml-1 text-amber-700"> error: {data.prediction.errorMinutes.toFixed(1)} min</span>
                      )}
                    </dd>
                  </>
                )}
              </dl>
            </div>
          ) : (
            <p className="text-sm text-stone-500">No analysis yet. Run analysis for COMPLETED cycles.</p>
          )}
        </div>
      </div>

      {/* Debug actions */}
      <div className="rounded-lg border border-amber-200 bg-amber-50/30 p-4">
        <h3 className="text-sm font-medium text-stone-700">Debug actions</h3>
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={handleRerun}
            disabled={actionLoading !== null || cycle.status !== "COMPLETED"}
            className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {actionLoading === "rerun" ? "Running…" : "Re-run analysis"}
          </button>
          {data.analysis && (
            <>
              <button
                type="button"
                onClick={() => handleMarkValid(!data.analysis!.isValid)}
                disabled={actionLoading !== null}
                className="rounded border border-stone-400 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100 disabled:opacity-50"
              >
                {actionLoading === "valid" || actionLoading === "invalid" ? "Updating…" : data.analysis.isValid ? "Mark invalid" : "Mark valid"}
              </button>
              <button
                type="button"
                onClick={() => handleExcludeFromTraining(!excludedFromTraining)}
                disabled={actionLoading !== null}
                className="rounded border border-amber-500 px-3 py-1.5 text-sm text-amber-800 hover:bg-amber-100 disabled:opacity-50"
              >
                {actionLoading === "exclude" ? "Updating…" : excludedFromTraining ? "Include in training" : "Exclude from training"}
              </button>
            </>
          )}
        </div>
        {cycle.status !== "COMPLETED" && (
          <p className="mt-2 text-xs text-stone-500">Re-run analysis is only available for COMPLETED cycles.</p>
        )}
      </div>
    </div>
  );
}
