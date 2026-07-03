"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { APP_TIMEZONE, formatInUserTz, formatTimeInTz } from "@/lib/timezone";
import { FermentationChart } from "./FermentationChart";
import { RiseGraph } from "./RiseGraph";
import { displayLabelForStep, displayLabelForEvent, isPhaseTracked } from "@/lib/bake-events";

type StarterPredictionInfo = {
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
};

type DashboardData = {
  userTimezone: string;
  appTimezone?: string;
  trackedBakePhases: string[] | null;
  devices: { id: string; name: string; deviceType: string; lastSeenAt: string | null }[];
  deviceCount: number;
  insights: string[];
  insightsGenerating: boolean;
  currentBake: {
    id: string;
    startedAt: string;
    recipe: {
      title: string;
      steps: {
        id: string;
        section: string;
        stepText: string;
        sortOrder: number;
        estimatedMinutesFromStart: number | null;
        eventType: string | null;
        eventPhase: string | null;
      }[];
    };
    events: { id: string; eventType: string; occurredAt: string; eventPhase: string; notes: string | null }[];
    doughDevice: { id: string; name: string } | null;
  } | null;
  feedingCycleRise: { recordedAt: string; distanceMm: number | null }[] | null;
  feedingCyclePredictedRise: { recordedAt: string; distanceMm: number }[] | null;
  starterPredictionStatus?: "ok" | "insufficient_data" | null;
  starterPrediction?: StarterPredictionInfo | null;
  currentBakeRise: { recordedAt: string; distanceMm: number | null }[] | null;
  lastStarterCycle: { id: string; startedAt: string; endedAt: string | null } | null;
  latestStarterReadings: { id: string; recordedAt: string; distanceMm: number | null; ambientTempC: number | null; ambientHumidityPct: number | null; readingType: string; deviceId: string }[];
  latestDoughReadings: { id: string; recordedAt: string; distanceMm: number | null; doughTempC: number | null; ambientTempC: number | null; readingType: string; deviceId: string }[];
};

function formatHoursSince(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = ms / (60 * 60 * 1000);
  return hours.toFixed(1);
}

/** Human-readable time until or past peak from server-provided predictedPeakAt (no prediction computed in UI). */
function formatTimeUntilOrPastPeak(predictedPeakAtIso: string): string {
  const peak = new Date(predictedPeakAtIso).getTime();
  const now = Date.now();
  const diffMs = peak - now;
  const diffMin = Math.round(diffMs / (60 * 1000));
  const absMin = Math.abs(diffMin);
  if (absMin < 60) return diffMin >= 0 ? `in ${absMin} min` : `${absMin} min ago`;
  const hours = Math.floor(absMin / 60);
  const mins = absMin % 60;
  const h = hours > 0 ? `${hours} h` : "";
  const m = mins > 0 ? ` ${mins} min` : "";
  return diffMin >= 0 ? `in ${h}${m}`.trim() : `${h}${m} ago`.trim();
}

function confidenceBadge(confidence: number): "low" | "med" | "high" {
  if (confidence < 0.4) return "low";
  if (confidence < 0.7) return "med";
  return "high";
}

export function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showSmoothedActual, setShowSmoothedActual] = useState(false);

  const fetchDashboard = () => {
    setFetchError(null);
    fetch("/api/dashboard")
      .then((r) => {
        if (!r.ok) return r.json().then((err) => Promise.reject(new Error(err?.message || err?.error || r.statusText)));
        return r.json();
      })
      .then((d) => {
        setData(d);
        setFetchError(null);
        setLoading(false);
      })
      .catch((err) => {
        setLoading(false);
        setData(null);
        setFetchError(err?.message || "Failed to load dashboard");
        console.error("Dashboard fetch failed:", err?.message || err);
      });
  };

  useEffect(() => {
    fetchDashboard();
  }, []);

  useEffect(() => {
    if (!data?.insightsGenerating) return;
    const t = setInterval(fetchDashboard, 3000);
    return () => clearInterval(t);
  }, [data?.insightsGenerating]);

  if (fetchError) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-12">
        <p className="text-amber-700 text-center">{fetchError}</p>
        <button
          type="button"
          onClick={() => { setLoading(true); fetchDashboard(); }}
          className="rounded bg-stone-200 px-4 py-2 text-stone-800 hover:bg-stone-300"
        >
          Retry
        </button>
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <p className="text-stone-500">Loading dashboard…</p>
      </div>
    );
  }

  const tz = data.userTimezone ?? "America/Edmonton";
  const appTz = data.appTimezone ?? APP_TIMEZONE;
  const {
    insights,
    insightsGenerating,
    currentBake,
    feedingCycleRise,
    feedingCyclePredictedRise,
    starterPredictionStatus,
    starterPrediction,
    currentBakeRise,
    lastStarterCycle,
    latestStarterReadings,
    latestDoughReadings,
  } = data;

  const latestStarter = latestStarterReadings?.[0];
  const latestDough = latestDoughReadings?.[0];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold text-stone-800">Starter Fermentation Dashboard</h1>

      {/* Coach insights — card */}
      <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-medium text-stone-700">Your sourdough coach</h2>
        </div>
        <div className="px-4 py-3">
          {insightsGenerating && (insights?.length ?? 0) === 0 && (
            <p className="text-sm text-stone-500">Generating insights…</p>
          )}
          <ul className="space-y-1.5">
            {(insights ?? []).map((line, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-stone-600">
                <span className="text-amber-600" aria-hidden>▸</span>
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Row: Current Starter Cycle + Current Status */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Current Starter Cycle — all times in APP_TIMEZONE (Edmonton) */}
        <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 px-4 py-3 flex items-center justify-between">
            <h2 className="text-sm font-medium text-stone-700">Current Starter Cycle</h2>
            <button
              type="button"
              onClick={() => fetchDashboard()}
              className="text-xs text-stone-500 hover:text-stone-700 underline"
            >
              Refresh
            </button>
          </div>
          <div className="px-4 py-3">
            {lastStarterCycle ? (
              <div className="space-y-3">
                <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
                  <dt className="text-stone-500">Fed at:</dt>
                  <dd className="text-stone-800">{formatInUserTz(lastStarterCycle.startedAt, appTz)}</dd>
                  <dt className="text-stone-500">Time since feed:</dt>
                  <dd className="text-stone-800">{formatHoursSince(lastStarterCycle.startedAt)} hours</dd>
                  <dt className="text-stone-500">Cycle:</dt>
                  <dd className="text-stone-800">
                    {lastStarterCycle.endedAt
                      ? `Ended ${formatInUserTz(lastStarterCycle.endedAt, appTz)}`
                      : "In progress"}
                  </dd>
                </dl>
                {starterPrediction ? (
                  <>
                    <div className="border-t border-stone-100 pt-3">
                      <p className="text-xs font-medium uppercase tracking-wide text-stone-400 mb-2">Prediction (model)</p>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                        <dt className="text-stone-500">Model:</dt>
                        <dd className="text-stone-800">{starterPrediction.modelName}</dd>
                        <dt className="text-stone-500">Predicted peak:</dt>
                        <dd className="text-stone-800">{formatTimeInTz(starterPrediction.predictedPeakAt, appTz)}</dd>
                        <dt className="text-stone-500">Time to / past peak:</dt>
                        <dd className="text-stone-800">{formatTimeUntilOrPastPeak(starterPrediction.predictedPeakAt)}</dd>
                        <dt className="text-stone-500">Peak window:</dt>
                        <dd className="text-stone-800">
                          {formatTimeInTz(starterPrediction.predictedPeakStartAt, appTz)} – {formatTimeInTz(starterPrediction.predictedPeakEndAt, appTz)}
                        </dd>
                        <dt className="text-stone-500">Confidence:</dt>
                        <dd>
                          <span
                            className={
                              confidenceBadge(starterPrediction.confidence) === "high"
                                ? "rounded bg-emerald-100 px-1.5 py-0.5 text-xs font-medium text-emerald-800"
                                : confidenceBadge(starterPrediction.confidence) === "med"
                                  ? "rounded bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800"
                                  : "rounded bg-stone-200 px-1.5 py-0.5 text-xs font-medium text-stone-700"
                            }
                          >
                            {confidenceBadge(starterPrediction.confidence)}
                          </span>
                        </dd>
                        {starterPrediction.predictedTimeToPeakMinutes != null && (
                          <>
                            <dt className="text-stone-500">Time to peak:</dt>
                            <dd className="text-stone-800">{Math.round(starterPrediction.predictedTimeToPeakMinutes)} min</dd>
                          </>
                        )}
                        {starterPrediction.tempUsedC != null && (
                          <>
                            <dt className="text-stone-500">Temp used:</dt>
                            <dd className="text-stone-800">
                              {starterPrediction.tempUsedC.toFixed(1)}°C
                              {starterPrediction.lowTempConfidence && (
                                <span className="ml-1 text-xs text-amber-600">(low confidence)</span>
                              )}
                            </dd>
                          </>
                        )}
                      </dl>
                    </div>
                    <p className="text-xs">
                      <Link
                        href={`/analytics?cycleId=${encodeURIComponent(starterPrediction.cycleId)}&modelId=${encodeURIComponent(starterPrediction.modelId)}`}
                        className="text-stone-500 hover:text-stone-700 underline"
                      >
                        Debug
                      </Link>
                    </p>
                  </>
                ) : starterPredictionStatus === "insufficient_data" ? (
                  <p className="text-xs text-amber-700 border-t border-stone-100 pt-3">
                    Collect 2–3 cycles with temperature data to get predictions.
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-sm text-stone-500">No starter cycle. Log a feeding to start.</p>
            )}
          </div>
        </div>

        {/* Current Status — starter live readings */}
        <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-medium text-stone-700">Current Status (Starter)</h2>
          </div>
          <div className="px-4 py-3">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-400">Live readings</h3>
            {latestStarter ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-stone-500">Temperature</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-stone-800">
                    {latestStarter.ambientTempC != null ? `${latestStarter.ambientTempC.toFixed(1)}°C` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500">Activity</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-stone-800">—</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500">Humidity</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-stone-800">
                    {latestStarter.ambientHumidityPct != null ? `${latestStarter.ambientHumidityPct.toFixed(1)}%` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500">Height</p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-stone-800">
                    {latestStarter.distanceMm != null ? `${(latestStarter.distanceMm / 10).toFixed(2)} cm` : "—"}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-500">No readings yet. Connect a starter monitor.</p>
            )}
          </div>
        </div>
      </div>

      {/* Fermentation Progress — actual, optional smoothed actual, predicted (all times APP_TIMEZONE) */}
      <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3 flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-medium text-stone-700">Fermentation Progress</h2>
          <label className="flex items-center gap-2 text-sm text-stone-600">
            <input
              type="checkbox"
              checked={showSmoothedActual}
              onChange={(e) => setShowSmoothedActual(e.target.checked)}
              className="rounded border-stone-300"
            />
            Smoothed actual
          </label>
        </div>
        <div className="px-4 py-3">
          <FermentationChart
            data={feedingCycleRise}
            predictedData={feedingCyclePredictedRise}
            showSmoothedActual={showSmoothedActual}
            height={400}
          />
          {starterPredictionStatus === "insufficient_data" && lastStarterCycle && (
            <p className="mt-2 text-xs text-amber-700">
              Collect 2–3 cycles with temperature data to get predictions.
            </p>
          )}
          {lastStarterCycle && (
            <p className="mt-2 text-xs text-stone-500">
              Cycle started {formatInUserTz(lastStarterCycle.startedAt, appTz)}
              {lastStarterCycle.endedAt && ` • ended ${formatInUserTz(lastStarterCycle.endedAt, appTz)}`}
              {" · Times in "}
              {appTz}
            </p>
          )}
        </div>
      </div>

      {/* Current bake */}
      <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
        <div className="border-b border-stone-200 px-4 py-3">
          <h2 className="text-sm font-medium text-stone-700">Current Bake</h2>
        </div>
        <div className="px-4 py-3">
          {!currentBake ? (
            <>
              <p className="text-sm text-stone-500">No active bake.</p>
              <Link href="/bakes/new" className="mt-2 inline-block text-sm font-medium text-blue-600 hover:underline">
                Start a bake →
              </Link>
            </>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-stone-700">
                <Link href={`/bakes/${currentBake.id}`} className="font-medium text-blue-600 hover:underline">
                  {currentBake.recipe.title}
                </Link>
                {" — started "}
                {formatInUserTz(currentBake.startedAt, tz)}
              </p>
              <BakeTimelinePreview bake={currentBake} userTimezone={tz} trackedPhases={data.trackedBakePhases ?? null} />
              {currentBakeRise && currentBakeRise.length > 0 && (
                <div className="pt-2">
                  <h3 className="mb-2 text-xs font-medium text-stone-500">Bake rise</h3>
                  <RiseGraph data={currentBakeRise} title="Height (mm)" height={160} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Dough monitor — Current Status (starter is in Current Status card above) */}
      <div className="grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-medium text-stone-700">Dough Monitor</h2>
          </div>
          <div className="px-4 py-3">
            <h3 className="mb-3 text-xs font-medium uppercase tracking-wide text-stone-400">Latest reading</h3>
            {latestDough ? (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs font-medium text-stone-500">Dough temp</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-stone-800">
                    {latestDough.doughTempC != null ? `${latestDough.doughTempC.toFixed(1)}°C` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500">Ambient temp</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-stone-800">
                    {latestDough.ambientTempC != null ? `${latestDough.ambientTempC.toFixed(1)}°C` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500">Height</p>
                  <p className="mt-0.5 text-lg font-semibold tabular-nums text-stone-800">
                    {latestDough.distanceMm != null ? `${(latestDough.distanceMm / 10).toFixed(2)} cm` : "—"}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-stone-500">At</p>
                  <p className="mt-0.5 text-sm tabular-nums text-stone-600">
                    {formatInUserTz(latestDough.recordedAt, tz)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-stone-500">No readings</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BakeTimelinePreview({
  bake,
  userTimezone,
  trackedPhases,
}: {
  bake: NonNullable<DashboardData["currentBake"]>;
  userTimezone: string;
  trackedPhases: string[] | null;
}) {
  const startedAt = new Date(bake.startedAt).getTime();
  const now = Date.now();

  type StepRow = {
    at: number;
    label: string;
    details: string;
    completed: boolean;
  };
  const rows: StepRow[] = [];

  bake.recipe.steps.forEach((s) => {
    if (s.estimatedMinutesFromStart != null) {
      const phase = s.eventPhase ?? "custom";
      if (!isPhaseTracked(phase, trackedPhases)) return;
      const at = startedAt + s.estimatedMinutesFromStart * 60 * 1000;
      const label = displayLabelForStep(s);
      rows.push({
        at,
        label,
        details: s.stepText,
        completed: false,
      });
    }
  });

  bake.events.forEach((e) => {
    if (!isPhaseTracked(e.eventPhase, trackedPhases)) return;
    const at = new Date(e.occurredAt).getTime();
    const label = displayLabelForEvent(e) + (e.notes ? ` — ${e.notes}` : "");
    rows.push({
      at,
      label,
      details: e.notes ?? displayLabelForEvent(e),
      completed: true,
    });
  });

  rows.sort((a, b) => a.at - b.at);

  const lastPassedIndex = rows.reduce((idx, row, i) => (row.at <= now ? i : idx), -1);
  const currentIndex = lastPassedIndex < 0 ? 0 : lastPassedIndex;

  if (rows.length === 0) {
    return (
      <div className="rounded border border-stone-100 bg-stone-50/50 p-3">
        <p className="text-sm text-stone-500">No steps yet. Add events on the bake page.</p>
      </div>
    );
  }

  return (
    <div className="rounded border border-stone-100 bg-stone-50/50 p-3">
      <ul className="divide-y divide-stone-100">
        {rows.map((row, i) => {
          const isCurrent = i === currentIndex;
          const timeStr = formatTimeInTz(new Date(row.at).toISOString(), userTimezone);
          return (
            <li
              key={i}
              className="group relative flex items-center gap-3 py-2 pr-2"
              title={row.details}
            >
              <span className="w-16 shrink-0 text-xs tabular-nums text-stone-500">{timeStr}</span>
              <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{row.label}</span>
              <span className="shrink-0 text-stone-400" aria-label={row.completed ? "Completed" : "Not done"}>
                {row.completed ? "✓" : "—"}
              </span>
              {isCurrent && (
                <span className="shrink-0 rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                  You are here
                </span>
              )}
              <div className="pointer-events-none absolute left-0 top-full z-10 mt-0.5 hidden max-w-sm rounded border border-stone-200 bg-white px-3 py-2 text-xs text-stone-600 shadow-lg group-hover:block whitespace-pre-wrap">
                {timeStr} — {row.label}
                {"\n"}
                {row.details}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
