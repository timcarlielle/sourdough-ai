"use client";

import { useState, useEffect, useCallback } from "react";
import { RiseGraph } from "@/components/RiseGraph";
import { formatInUserTz, APP_TIMEZONE } from "@/lib/timezone";
import { useUserTimezone } from "@/lib/use-user-timezone";
import { CycleDebugChart } from "@/app/feedings/[id]/CycleDebugChart";
import { StarterPerformanceChart } from "./StarterPerformanceChart";

type BakeOption = { id: string; startedAt: string; recipeTitle: string; hasAdjustments: boolean };
type DebugData = {
  bake: { id: string; startedAt: string; endedAt: string | null; recipe: { title: string }; outcomes: unknown[] };
  adjustmentSet: {
    id: string;
    suggestions: Array<{ type: string; old_value?: string; suggested?: string; reason?: string }>;
    rulesTriggered: string[];
    starterMetrics: Record<string, unknown> | null;
    doughMetrics: Record<string, unknown> | null;
    confidenceScore: number | null;
    createdAt: string;
  } | null;
  starterCurve: { recordedAt: string; distanceMm: number | null }[];
  doughCurve: { recordedAt: string; distanceMm: number | null }[];
};

type StarterDebugData = {
  cycle: { id: string; startedAt: string; endedAt: string | null; status: string; deviceId: string | null };
  model: { id: string; name: string; trainedOnCycles: number; paramA: number | null; paramK: number | null; paramB: number | null; sigmaBaseMinutes: number | null; meta: unknown } | null;
  prediction: {
    predictedPeakAt: string;
    predictedPeakStartAt: string;
    predictedPeakEndAt: string;
    confidence: number;
    predictedTimeToPeakMinutes: number;
    tempUsedC?: number;
    lowTempConfidence?: boolean;
    errorMinutes: number | null;
  } | null;
  analysis?: Record<string, unknown> | null;
  series?: Record<string, { recordedAt: string; heightMm: number }[] | null>;
};

type StarterModelRow = {
  id: string;
  name: string;
  isActive: boolean;
  isLocked: boolean;
  modelType: string;
  paramA: number | null;
  paramK: number | null;
  paramB: number | null;
  sigmaBaseMinutes: number | null;
  trainedOnCycles: number;
  lastTrainedAt: string | null;
  meta: unknown;
  createdAt: string;
  updatedAt: string;
};

type PerfRow = {
  cycleId: string;
  startedAt: string;
  tempC: number | null;
  actualTimeToPeakMinutes: number | null;
  predictedTimeToPeakMinutes: number | null;
  errorMinutes: number | null;
  isValid: boolean;
};

export function AnalyticsDebugClient({
  bakes,
  initialCycleId,
  initialModelId,
  starterDebugEnabled = false,
}: {
  bakes: BakeOption[];
  initialCycleId?: string | null;
  initialModelId?: string | null;
  starterDebugEnabled?: boolean;
}) {
  const tz = useUserTimezone();
  const appTz = APP_TIMEZONE;
  const [selectedBakeId, setSelectedBakeId] = useState<string>(bakes[0]?.id ?? "");
  const [data, setData] = useState<DebugData | null>(null);
  const [loading, setLoading] = useState(false);
  const [starterDebug, setStarterDebug] = useState<StarterDebugData | null>(null);
  const [starterDebugLoading, setStarterDebugLoading] = useState(false);

  // Starter debug (when flag on): models, performance, cycles, selected cycle debug
  const [models, setModels] = useState<StarterModelRow[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [performance, setPerformance] = useState<{ rows: PerfRow[]; modelCurve: { tempC: number; timeToPeakMinutes: number }[]; modelName: string | null } | null>(null);
  const [performanceLoading, setPerformanceLoading] = useState(false);
  const [cycles, setCycles] = useState<{ id: string; startedAt: string; endedAt: string | null; status: string }[]>([]);
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null);
  const [cyclesLoading, setCyclesLoading] = useState(false);
  const [selectedCycleId, setSelectedCycleId] = useState<string>("");
  const [cycleDetail, setCycleDetail] = useState<StarterDebugData | null>(null);
  const [cycleDetailLoading, setCycleDetailLoading] = useState(false);
  const [seriesEnabled, setSeriesEnabled] = useState<Record<string, boolean>>({
    rawSeries: true,
    cleanedSeries: false,
    smoothedSeries: true,
    fittedSeries: true,
    predictedSeries: true,
  });
  const [overrideParams, setOverrideParams] = useState({ paramA: "", paramK: "", paramB: "", sigmaBaseMinutes: "" });
  const [overrideSaving, setOverrideSaving] = useState(false);
  const [forcePredictionLoading, setForcePredictionLoading] = useState(false);

  const refreshModels = useCallback(() => {
    if (!starterDebugEnabled) return;
    setModelsLoading(true);
    fetch("/api/analytics/starter-models")
      .then((r) => (r.ok ? r.json() : { models: [] }))
      .then((d) => setModels(d.models ?? []))
      .finally(() => setModelsLoading(false));
  }, [starterDebugEnabled]);

  const refreshPerformance = useCallback(() => {
    if (!starterDebugEnabled) return;
    setPerformanceLoading(true);
    fetch("/api/analytics/starter-performance?limit=30&validOnly=1")
      .then((r) => (r.ok ? r.json() : null))
      .then(setPerformance)
      .finally(() => setPerformanceLoading(false));
  }, [starterDebugEnabled]);

  const refreshCycles = useCallback(() => {
    if (!starterDebugEnabled) return;
    setCyclesLoading(true);
    fetch("/api/analytics/starter-cycles?limit=50")
      .then((r) => (r.ok ? r.json() : { cycles: [], activeCycleId: null }))
      .then((d) => {
        setCycles(d.cycles ?? []);
        setActiveCycleId(d.activeCycleId ?? null);
        if (!d.cycles?.length) setSelectedCycleId("");
        else if (!d.cycles.some((c: { id: string }) => c.id === selectedCycleId)) setSelectedCycleId(d.cycles[0]?.id ?? "");
      })
      .finally(() => setCyclesLoading(false));
  }, [starterDebugEnabled]);

  useEffect(() => {
    if (starterDebugEnabled) {
      refreshModels();
      refreshPerformance();
      refreshCycles();
    }
  }, [starterDebugEnabled, refreshModels, refreshPerformance, refreshCycles]);

  useEffect(() => {
    if (!selectedCycleId || !starterDebugEnabled) {
      setCycleDetail(null);
      return;
    }
    setCycleDetailLoading(true);
    fetch(`/api/analytics/starter-debug?cycleId=${encodeURIComponent(selectedCycleId)}&includeAnalysis=1`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setCycleDetail)
      .finally(() => setCycleDetailLoading(false));
  }, [selectedCycleId, starterDebugEnabled]);

  useEffect(() => {
    if (!initialCycleId) {
      setStarterDebug(null);
      return;
    }
    setStarterDebugLoading(true);
    const params = new URLSearchParams({ cycleId: initialCycleId });
    if (initialModelId) params.set("modelId", initialModelId);
    fetch(`/api/analytics/starter-debug?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setStarterDebug)
      .finally(() => setStarterDebugLoading(false));
  }, [initialCycleId, initialModelId]);

  useEffect(() => {
    if (!selectedBakeId) {
      setData(null);
      return;
    }
    setLoading(true);
    fetch(`/api/analytics/debug?bakeId=${encodeURIComponent(selectedBakeId)}`)
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  }, [selectedBakeId]);

  const activeModel = models.find((m) => m.isActive);
  const runModelAction = async (modelId: string, action: string, body?: Record<string, unknown>) => {
    const res = await fetch(`/api/analytics/starter-model/${modelId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...body }),
    });
    if (res.ok) refreshModels();
    return res;
  };
  const handleOverrideParams = async (createNewVersion: boolean) => {
    if (!activeModel) return;
    setOverrideSaving(true);
    try {
      const params: Record<string, number> = {};
      if (overrideParams.paramA !== "") params.paramA = parseFloat(overrideParams.paramA);
      if (overrideParams.paramK !== "") params.paramK = parseFloat(overrideParams.paramK);
      if (overrideParams.paramB !== "") params.paramB = parseFloat(overrideParams.paramB);
      if (overrideParams.sigmaBaseMinutes !== "") params.sigmaBaseMinutes = parseFloat(overrideParams.sigmaBaseMinutes);
      if (Object.keys(params).length === 0) return;
      await runModelAction(activeModel.id, "overrideParams", { params, createNewVersion });
      setOverrideParams({ paramA: "", paramK: "", paramB: "", sigmaBaseMinutes: "" });
    } finally {
      setOverrideSaving(false);
    }
  };
  const handleForcePrediction = async () => {
    setForcePredictionLoading(true);
    try {
      const res = await fetch("/api/analytics/starter-model/force-prediction", { method: "POST" });
      if (res.ok) {
        refreshPerformance();
        if (selectedCycleId === activeCycleId) {
          setCycleDetailLoading(true);
          fetch(`/api/analytics/starter-debug?cycleId=${encodeURIComponent(selectedCycleId)}&includeAnalysis=1`)
            .then((r) => (r.ok ? r.json() : null))
            .then(setCycleDetail)
            .finally(() => setCycleDetailLoading(false));
        }
      }
    } finally {
      setForcePredictionLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {starterDebugEnabled && (
        <div className="space-y-6 rounded-lg border-2 border-amber-200 bg-amber-50/30 p-4">
          <h2 className="text-lg font-semibold text-stone-800">Starter prediction debug</h2>
          <p className="text-xs text-stone-500">Model management, performance, and cycle viewer. Guarded by NEXT_PUBLIC_STARTER_DEBUG.</p>

          {/* Model management */}
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h3 className="font-medium text-stone-800">Model management</h3>
            {modelsLoading && <p className="mt-2 text-sm text-stone-500">Loading models…</p>}
            {!modelsLoading && (
              <div className="mt-3 space-y-3 text-sm">
                {activeModel ? (
                  <dl className="grid gap-1 sm:grid-cols-2">
                    <dt className="text-stone-500">Name</dt>
                    <dd className="font-mono text-stone-800">{activeModel.name}</dd>
                    <dt className="text-stone-500">Locked</dt>
                    <dd className="font-mono text-stone-800">{activeModel.isLocked ? "Yes" : "No"}</dd>
                    <dt className="text-stone-500">Trained on cycles</dt>
                    <dd className="font-mono text-stone-800">{activeModel.trainedOnCycles}</dd>
                    <dt className="text-stone-500">Last trained</dt>
                    <dd className="font-mono text-stone-800">{activeModel.lastTrainedAt ? formatInUserTz(activeModel.lastTrainedAt, appTz) : "—"}</dd>
                    <dt className="text-stone-500">Parameters (a, k, b, σ)</dt>
                    <dd className="font-mono text-stone-800">
                      {activeModel.paramA?.toFixed(3) ?? "—"}, {activeModel.paramK?.toFixed(3) ?? "—"}, {activeModel.paramB?.toFixed(3) ?? "—"}, {activeModel.sigmaBaseMinutes ?? "—"}
                    </dd>
                  </dl>
                ) : (
                  <p className="text-stone-500">No active model</p>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  {activeModel && (
                    <>
                      <button
                        type="button"
                        onClick={() => runModelAction(activeModel.id, "clone")}
                        className="rounded bg-stone-200 px-3 py-1.5 text-stone-800 hover:bg-stone-300"
                      >
                        Create new model from this
                      </button>
                      <button
                        type="button"
                        onClick={() => runModelAction(activeModel.id, activeModel.isLocked ? "unlock" : "lock")}
                        className="rounded bg-stone-200 px-3 py-1.5 text-stone-800 hover:bg-stone-300"
                      >
                        {activeModel.isLocked ? "Unlock" : "Lock"}
                      </button>
                    </>
                  )}
                  {models.filter((m) => !m.isActive).map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => runModelAction(m.id, "setActive")}
                      className="rounded bg-stone-200 px-3 py-1.5 text-stone-800 hover:bg-stone-300"
                    >
                      Set active: {m.name}
                    </button>
                  ))}
                </div>
                {activeModel && (
                  <div className="mt-4 rounded border border-stone-200 bg-stone-50/50 p-3">
                    <p className="mb-2 text-xs font-medium text-stone-600">Override parameters</p>
                    <div className="grid gap-2 sm:grid-cols-4">
                      <input
                        type="number"
                        step="any"
                        placeholder={`a (${activeModel.paramA ?? "—"})`}
                        value={overrideParams.paramA}
                        onChange={(e) => setOverrideParams((p) => ({ ...p, paramA: e.target.value }))}
                        className="rounded border border-stone-300 px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder={`k (${activeModel.paramK ?? "—"})`}
                        value={overrideParams.paramK}
                        onChange={(e) => setOverrideParams((p) => ({ ...p, paramK: e.target.value }))}
                        className="rounded border border-stone-300 px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder={`b (${activeModel.paramB ?? "—"})`}
                        value={overrideParams.paramB}
                        onChange={(e) => setOverrideParams((p) => ({ ...p, paramB: e.target.value }))}
                        className="rounded border border-stone-300 px-2 py-1 text-sm"
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder={`σ (${activeModel.sigmaBaseMinutes ?? "—"})`}
                        value={overrideParams.sigmaBaseMinutes}
                        onChange={(e) => setOverrideParams((p) => ({ ...p, sigmaBaseMinutes: e.target.value }))}
                        className="rounded border border-stone-300 px-2 py-1 text-sm"
                      />
                    </div>
                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        disabled={overrideSaving}
                        onClick={() => handleOverrideParams(true)}
                        className="rounded bg-indigo-600 px-3 py-1.5 text-white hover:bg-indigo-700 disabled:opacity-50"
                      >
                        Save as new version
                      </button>
                      <button
                        type="button"
                        disabled={overrideSaving}
                        onClick={() => handleOverrideParams(false)}
                        className="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        Overwrite this model
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Performance view */}
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h3 className="font-medium text-stone-800">Performance (valid cycles)</h3>
            {performanceLoading && <p className="mt-2 text-sm text-stone-500">Loading…</p>}
            {!performanceLoading && performance && (
              <div className="mt-3 space-y-3">
                {performance.modelName && <p className="text-xs text-stone-500">Model: {performance.modelName}</p>}
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[400px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-stone-200">
                        <th className="py-1 pr-2">Started</th>
                        <th className="py-1 pr-2">Temp °C</th>
                        <th className="py-1 pr-2">Actual TTP (min)</th>
                        <th className="py-1 pr-2">Predicted TTP (min)</th>
                        <th className="py-1 pr-2">Error (min)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {performance.rows.map((r) => (
                        <tr key={r.cycleId} className="border-b border-stone-100">
                          <td className="py-1 pr-2 font-mono text-xs">{formatInUserTz(r.startedAt, appTz)}</td>
                          <td className="py-1 pr-2">{r.tempC != null ? r.tempC.toFixed(1) : "—"}</td>
                          <td className="py-1 pr-2">{r.actualTimeToPeakMinutes != null ? Math.round(r.actualTimeToPeakMinutes) : "—"}</td>
                          <td className="py-1 pr-2">{r.predictedTimeToPeakMinutes != null ? Math.round(r.predictedTimeToPeakMinutes) : "—"}</td>
                          <td className="py-1 pr-2">{r.errorMinutes != null ? r.errorMinutes.toFixed(1) : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <StarterPerformanceChart
                    actualPoints={performance.rows
                      .filter((r) => r.tempC != null && r.actualTimeToPeakMinutes != null)
                      .map((r) => ({ tempC: r.tempC!, timeToPeakMinutes: r.actualTimeToPeakMinutes! }))}
                    modelCurve={performance.modelCurve}
                    height={280}
                  />
                </div>
              </div>
            )}
            {!performanceLoading && performance?.rows.length === 0 && <p className="mt-2 text-sm text-stone-500">No valid cycles</p>}
          </div>

          {/* Cycle debug viewer */}
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h3 className="font-medium text-stone-800">Cycle debug viewer</h3>
            {cyclesLoading && <p className="mt-2 text-sm text-stone-500">Loading cycles…</p>}
            {!cyclesLoading && (
              <div className="mt-3 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <label className="text-sm text-stone-600">Cycle</label>
                  <select
                    value={selectedCycleId}
                    onChange={(e) => setSelectedCycleId(e.target.value)}
                    className="rounded border border-stone-300 bg-white px-3 py-1.5 text-stone-800"
                  >
                    <option value="">— Select —</option>
                    {cycles.map((c) => (
                      <option key={c.id} value={c.id}>
                        {formatInUserTz(c.startedAt, appTz)} — {c.status}
                      </option>
                    ))}
                  </select>
                  {activeCycleId && (
                    <span className="text-xs text-stone-500">Active: {cycles.find((c) => c.id === activeCycleId) ? formatInUserTz(cycles.find((c) => c.id === activeCycleId)!.startedAt, appTz) : activeCycleId.slice(0, 8)}</span>
                  )}
                  <button
                    type="button"
                    disabled={!activeCycleId || forcePredictionLoading}
                    onClick={handleForcePrediction}
                    className="rounded bg-amber-600 px-3 py-1.5 text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {forcePredictionLoading ? "Recomputing…" : "Force recompute prediction for active cycle"}
                  </button>
                </div>
                {cycleDetailLoading && <p className="text-sm text-stone-500">Loading cycle…</p>}
                {!cycleDetailLoading && cycleDetail && selectedCycleId && (
                  <div className="space-y-4">
                    <dl className="grid gap-1 text-sm sm:grid-cols-2">
                      <dt className="text-stone-500">Cycle</dt>
                      <dd className="font-mono text-stone-800">{cycleDetail.cycle.id} — {formatInUserTz(cycleDetail.cycle.startedAt, appTz)} ({cycleDetail.cycle.status})</dd>
                      {cycleDetail.model && (
                        <>
                          <dt className="text-stone-500">Model</dt>
                          <dd className="font-mono text-stone-800">{cycleDetail.model.name}</dd>
                        </>
                      )}
                      {cycleDetail.prediction && (
                        <>
                          <dt className="text-stone-500">Predicted peak</dt>
                          <dd className="font-mono text-stone-800">{formatInUserTz(cycleDetail.prediction.predictedPeakAt, appTz)}</dd>
                          <dt className="text-stone-500">Error (min)</dt>
                          <dd className="font-mono text-stone-800">{cycleDetail.prediction.errorMinutes ?? "—"}</dd>
                        </>
                      )}
                    </dl>
                    {cycleDetail.analysis != null && (
                      <div>
                        <h4 className="text-sm font-medium text-stone-700">Analysis parameters</h4>
                        <pre className="mt-1 max-h-48 overflow-auto rounded border border-stone-200 bg-stone-50 p-2 text-xs">{JSON.stringify(cycleDetail.analysis, null, 2)}</pre>
                      </div>
                    )}
                    {cycleDetail.series && (
                      <div>
                        <h4 className="mb-2 text-sm font-medium text-stone-700">Series</h4>
                        <div className="mb-2 flex flex-wrap gap-2">
                          {Object.keys(cycleDetail.series).map((key) => (
                            <label key={key} className="flex items-center gap-1 text-xs">
                              <input
                                type="checkbox"
                                checked={seriesEnabled[key] ?? false}
                                onChange={(e) => setSeriesEnabled((s) => ({ ...s, [key]: e.target.checked }))}
                              />
                              {key.replace("Series", "")}
                            </label>
                          ))}
                        </div>
                        <CycleDebugChart series={cycleDetail.series} enabled={seriesEnabled} height={320} />
                      </div>
                    )}
                  </div>
                )}
                {!cycleDetailLoading && selectedCycleId && !cycleDetail && <p className="text-sm text-stone-500">No data for this cycle</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {initialCycleId && (
        <div className="rounded-lg border border-stone-200 bg-white p-4">
          <h2 className="font-medium text-stone-800">Starter cycle debug</h2>
          <p className="text-xs text-stone-500 mt-1">Pre-filtered from dashboard (cycle + model)</p>
          {starterDebugLoading && <p className="mt-2 text-sm text-stone-500">Loading…</p>}
          {!starterDebugLoading && starterDebug && (
            <div className="mt-3 space-y-3 text-sm">
              <dl className="grid gap-1 sm:grid-cols-2">
                <dt className="text-stone-500">Cycle</dt>
                <dd className="font-mono text-stone-800">
                  {starterDebug.cycle.id} — {formatInUserTz(starterDebug.cycle.startedAt, appTz)}
                  {starterDebug.cycle.endedAt && ` to ${formatInUserTz(starterDebug.cycle.endedAt, appTz)}`} ({starterDebug.cycle.status})
                </dd>
                {starterDebug.model && (
                  <>
                    <dt className="text-stone-500">Model</dt>
                    <dd className="font-mono text-stone-800">{starterDebug.model.name} (trained on {starterDebug.model.trainedOnCycles} cycles)</dd>
                    <dt className="text-stone-500">Params</dt>
                    <dd className="font-mono text-stone-800">
                      a={starterDebug.model.paramA?.toFixed(2) ?? "—"} k={starterDebug.model.paramK?.toFixed(2) ?? "—"} b={starterDebug.model.paramB?.toFixed(2) ?? "—"} σ={starterDebug.model.sigmaBaseMinutes ?? "—"}
                    </dd>
                  </>
                )}
                {starterDebug.prediction && (
                  <>
                    <dt className="text-stone-500">Predicted peak</dt>
                    <dd className="font-mono text-stone-800">{formatInUserTz(starterDebug.prediction.predictedPeakAt, appTz)}</dd>
                    <dt className="text-stone-500">Peak window</dt>
                    <dd className="font-mono text-stone-800">
                      {formatInUserTz(starterDebug.prediction.predictedPeakStartAt, appTz)} – {formatInUserTz(starterDebug.prediction.predictedPeakEndAt, appTz)}
                    </dd>
                    <dt className="text-stone-500">Confidence / time to peak / temp</dt>
                    <dd className="font-mono text-stone-800">
                      {starterDebug.prediction.confidence.toFixed(2)} / {starterDebug.prediction.predictedTimeToPeakMinutes} min / {starterDebug.prediction.tempUsedC?.toFixed(1) ?? "—"}°C
                      {starterDebug.prediction.lowTempConfidence && " (low temp confidence)"}
                    </dd>
                    {starterDebug.prediction.errorMinutes != null && (
                      <>
                        <dt className="text-stone-500">Error (min)</dt>
                        <dd className="font-mono text-stone-800">{starterDebug.prediction.errorMinutes.toFixed(1)}</dd>
                      </>
                    )}
                  </>
                )}
              </dl>
              {!starterDebug.prediction && <p className="text-amber-700 text-xs">No prediction (insufficient data or untrained model)</p>}
            </div>
          )}
          {!starterDebugLoading && initialCycleId && !starterDebug && <p className="mt-2 text-sm text-stone-500">Cycle not found or error</p>}
        </div>
      )}

      <div>
        <label className="text-sm font-medium text-stone-700">Select bake</label>
        <select
          value={selectedBakeId}
          onChange={(e) => setSelectedBakeId(e.target.value)}
          className="mt-1 block w-full max-w-md rounded border border-stone-300 bg-white px-3 py-2 text-stone-800"
        >
          {bakes.map((b) => (
            <option key={b.id} value={b.id}>
              {b.recipeTitle} — {formatInUserTz(b.startedAt, tz)}
              {b.hasAdjustments ? " (has suggestions)" : ""}
            </option>
          ))}
        </select>
      </div>

      {loading && <p className="text-sm text-stone-500">Loading…</p>}
      {!loading && data && (
        <div className="space-y-6">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <h2 className="font-medium text-stone-800">Bake</h2>
            <p className="text-sm text-stone-600">
              {data.bake.recipe.title} — Started {formatInUserTz(data.bake.startedAt, tz)}
              {data.bake.endedAt && `, ended ${formatInUserTz(data.bake.endedAt, tz)}`}
            </p>
            {data.bake.outcomes.length > 0 && (
              <p className="mt-1 text-xs text-stone-500">Outcome logged ({data.bake.outcomes.length})</p>
            )}
          </div>

          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 font-medium text-stone-800">Starter curve</h3>
              <RiseGraph data={data.starterCurve} title="" height={160} />
            </div>
            <div>
              <h3 className="mb-2 font-medium text-stone-800">Dough curve</h3>
              <RiseGraph data={data.doughCurve} title="" height={160} />
            </div>
          </div>

          {data.adjustmentSet ? (
            <>
              <div className="rounded-lg border border-stone-200 bg-white p-4">
                <h3 className="font-medium text-stone-800">Derived metrics</h3>
                <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                  {data.adjustmentSet.starterMetrics &&
                    Object.entries(data.adjustmentSet.starterMetrics).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-stone-500">{k}</dt>
                        <dd className="font-mono text-stone-800">{String(v)}</dd>
                      </div>
                    ))}
                  {data.adjustmentSet.doughMetrics &&
                    Object.entries(data.adjustmentSet.doughMetrics).map(([k, v]) => (
                      <div key={k} className="flex gap-2">
                        <dt className="text-stone-500">{k}</dt>
                        <dd className="font-mono text-stone-800">{String(v)}</dd>
                      </div>
                    ))}
                  {!data.adjustmentSet.starterMetrics && !data.adjustmentSet.doughMetrics && (
                    <p className="text-stone-500">No metrics (no telemetry for this bake)</p>
                  )}
                </dl>
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-4">
                <h3 className="font-medium text-stone-800">Rules triggered</h3>
                {data.adjustmentSet.rulesTriggered.length > 0 ? (
                  <ul className="mt-2 list-inside list-disc text-sm text-stone-700">
                    {data.adjustmentSet.rulesTriggered.map((r) => (
                      <li key={r}>{r}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-stone-500">None</p>
                )}
              </div>

              <div className="rounded-lg border border-stone-200 bg-white p-4">
                <h3 className="font-medium text-stone-800">Suggestions</h3>
                {data.adjustmentSet.suggestions.length > 0 ? (
                  <ul className="mt-2 space-y-2">
                    {data.adjustmentSet.suggestions.map((s, i) => (
                      <li key={i} className="rounded border border-stone-100 bg-stone-50/50 p-3 text-sm">
                        <span className="font-medium text-amber-800">{s.type}</span>
                        {s.old_value != null && (
                          <span className="text-stone-600"> — was {s.old_value}</span>
                        )}
                        {s.suggested != null && (
                          <span className="text-stone-700"> → suggest {s.suggested}</span>
                        )}
                        {s.reason && <p className="mt-1 text-stone-500">{s.reason}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-2 text-sm text-stone-500">No suggestions</p>
                )}
                {data.adjustmentSet.confidenceScore != null && (
                  <p className="mt-2 text-xs text-stone-400">Confidence: {data.adjustmentSet.confidenceScore}</p>
                )}
              </div>
            </>
          ) : (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm text-amber-800">No adjustment set for this bake yet. Log an outcome to trigger the analytics job, then refresh.</p>
            </div>
          )}
        </div>
      )}
      {!loading && !data && selectedBakeId && <p className="text-sm text-stone-500">No data</p>}
    </div>
  );
}
