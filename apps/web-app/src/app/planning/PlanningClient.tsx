"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_TIMEZONE, formatInUserTz, formatTimeInTz } from "@/lib/timezone";
import { useUserTimezone } from "@/lib/use-user-timezone";

type Recipe = { id: string; title: string };

type PlanStep = { type: string; at: string; label?: string };

type StarterPlanResponse = {
  steps: PlanStep[];
  feedTime: string;
  mixTime: string;
  targetCompletion: string;
  peakWindowStart: string;
  peakWindowEnd: string;
  retardEnabled: boolean;
  fridgeInAt: string | null;
  fridgeOutAt: string | null;
  timeToPeakMinutes: number;
  windowHalfWidthMinutes: number;
  confidence: number;
  modelName: string;
  roomTempC: number;
  fridgeTempC: number;
  fridgeFactor: number | null;
  summary: { totalBakeMinutes: number; mixMinutes: number };
};

const STEP_LABELS: Record<string, string> = {
  FEED: "Feed starter",
  FRIDGE_IN: "Put in fridge",
  FRIDGE_OUT: "Remove from fridge",
  PEAK_WINDOW: "Peak window",
  MIX: "Mix dough",
};

export function PlanningClient({
  recipes,
  lastCycleStartedAt,
}: {
  recipes: Recipe[];
  lastCycleStartedAt: string | null;
}) {
  const tz = useUserTimezone();
  const appTz = APP_TIMEZONE;
  const [starterReady, setStarterReady] = useState<{
    ready: boolean;
    message: string;
    state: string | null;
    metrics: Record<string, unknown> | null;
  } | null>(null);
  const [loadingStarter, setLoadingStarter] = useState(false);
  const [targetCompletion, setTargetCompletion] = useState("");
  const [scheduleRecipeId, setScheduleRecipeId] = useState(recipes[0]?.id ?? "");
  const [retardEnabled, setRetardEnabled] = useState(false);
  const [roomTempC, setRoomTempC] = useState("");
  const [fridgeTempC, setFridgeTempC] = useState("4");
  const [fridgeFactor, setFridgeFactor] = useState("0.15");
  const [plan, setPlan] = useState<StarterPlanResponse | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const [loadingPlan, setLoadingPlan] = useState(false);
  const [starting, setStarting] = useState(false);
  const router = useRouter();

  useEffect(() => {
    setLoadingStarter(true);
    fetch("/api/planning/starter-ready")
      .then((r) => r.json())
      .then((d) => setStarterReady({ ready: d.ready, message: d.message, state: d.state, metrics: d.metrics }))
      .finally(() => setLoadingStarter(false));
  }, []);

  function defaultTarget() {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 16);
  }

  function loadPlan() {
    const when = targetCompletion.trim() || defaultTarget();
    if (!when) return;
    setPlanError(null);
    setLoadingPlan(true);
    const body: Record<string, unknown> = {
      targetCompletion: new Date(when).toISOString(),
      recipeId: scheduleRecipeId,
      retardEnabled,
      fridgeFactor: parseFloat(fridgeFactor) || 0.15,
    };
    if (roomTempC !== "") body.roomTempC = parseFloat(roomTempC);
    if (fridgeTempC !== "") body.fridgeTempC = parseFloat(fridgeTempC);
    fetch("/api/planning/starter-plan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) {
          setPlanError(data.message ?? data.error ?? "Failed to get plan");
          setPlan(null);
          return;
        }
        setPlan(data);
      })
      .finally(() => setLoadingPlan(false));
  }

  async function startBake() {
    if (!plan) return;
    setStarting(true);
    try {
      const res = await fetch("/api/bakes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipeId: scheduleRecipeId,
          startedAt: plan.mixTime,
          starterPlanSteps: plan.steps,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        alert(err.error ?? "Could not start bake");
        return;
      }
      const bake = await res.json();
      router.push(`/bakes/${bake.id}`);
    } finally {
      setStarting(false);
    }
  }

  const confidenceLabel = plan
    ? plan.confidence >= 0.7
      ? "High"
      : plan.confidence >= 0.4
        ? "Medium"
        : "Low"
  : null;

  return (
    <div className="space-y-8">
      <section className="rounded-lg border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-medium text-stone-800">Starter ready?</h2>
        <p className="mt-1 text-sm text-stone-500">Based on your last starter cycle and telemetry.</p>
        {loadingStarter && <p className="mt-4 text-sm text-stone-500">Checking…</p>}
        {!loadingStarter && starterReady && (
          <div className="mt-4 rounded border border-stone-100 bg-stone-50/50 p-4">
            <p className={starterReady.ready ? "text-amber-800 font-medium" : "text-stone-700"}>{starterReady.message}</p>
            {starterReady.state && (
              <p className="mt-1 text-xs text-stone-500">State: {starterReady.state}</p>
            )}
            {lastCycleStartedAt && (
              <p className="mt-1 text-xs text-stone-500">
                Last cycle started {formatInUserTz(lastCycleStartedAt, tz)}
              </p>
            )}
          </div>
        )}
      </section>

      <section className="rounded-lg border border-stone-200 bg-white p-6">
        <h2 className="text-lg font-medium text-stone-800">Plan a bake (starter + optional retard)</h2>
        <p className="mt-1 text-sm text-stone-500">
          Set &quot;bread ready by&quot; time and we plan feeding and optional fridge steps using your starter model.
        </p>
        <div className="mt-6 space-y-4">
          <div className="flex flex-wrap gap-6">
            <div>
              <label className="block text-xs font-medium text-stone-600">Recipe</label>
              <select
                value={scheduleRecipeId}
                onChange={(e) => setScheduleRecipeId(e.target.value)}
                className="mt-1 rounded border border-stone-300 bg-white px-3 py-2"
              >
                {recipes.map((r) => (
                  <option key={r.id} value={r.id}>{r.title}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600">Bread ready by (local)</label>
              <input
                type="datetime-local"
                value={targetCompletion || defaultTarget()}
                onChange={(e) => setTargetCompletion(e.target.value)}
                className="mt-1 rounded border border-stone-300 px-3 py-2"
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-6 border-t border-stone-100 pt-4">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={retardEnabled}
                onChange={(e) => setRetardEnabled(e.target.checked)}
                className="rounded border-stone-300"
              />
              <span className="text-sm font-medium text-stone-700">Retard enabled</span>
            </label>
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs text-stone-500">Room temp °C (optional)</label>
                <input
                  type="number"
                  step="0.5"
                  min="15"
                  max="30"
                  placeholder="22"
                  value={roomTempC}
                  onChange={(e) => setRoomTempC(e.target.value)}
                  className="mt-0.5 w-20 rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-stone-500">Fridge temp °C</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="10"
                  value={fridgeTempC}
                  onChange={(e) => setFridgeTempC(e.target.value)}
                  className="mt-0.5 w-20 rounded border border-stone-300 px-2 py-1.5 text-sm"
                />
              </div>
              {retardEnabled && (
                <div>
                  <label className="block text-xs text-stone-500">Fridge factor (0.1–0.5)</label>
                  <input
                    type="number"
                    step="0.05"
                    min="0.1"
                    max="0.5"
                    value={fridgeFactor}
                    onChange={(e) => setFridgeFactor(e.target.value)}
                    className="mt-0.5 w-20 rounded border border-stone-300 px-2 py-1.5 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={loadPlan}
            disabled={loadingPlan}
            className="rounded bg-amber-700 px-4 py-2 text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {loadingPlan ? "Computing plan…" : "Get starter plan"}
          </button>
        </div>
        {planError && (
          <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            {planError}
          </div>
        )}
        {plan && (
          <div className="mt-6 space-y-4">
            <p className="text-xs text-stone-500">
              This is a guidance plan from your starter model. Times in {appTz}.
            </p>
            {confidenceLabel && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-stone-600">Confidence:</span>
                <span
                  className={
                    confidenceLabel === "High"
                      ? "rounded bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800"
                      : confidenceLabel === "Medium"
                        ? "rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
                        : "rounded bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-700"
                  }
                >
                  {confidenceLabel}
                </span>
                <span className="text-xs text-stone-500">({plan.modelName})</span>
              </div>
            )}
            <ul className="space-y-2">
              {plan.steps
                .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())
                .map((step, i) => (
                  <li
                    key={i}
                    className="flex items-center gap-4 rounded-lg border border-stone-200 bg-stone-50/50 px-4 py-3"
                  >
                    <span className="w-32 shrink-0 text-xs font-medium uppercase text-stone-500">
                      {STEP_LABELS[step.type] ?? step.type}
                    </span>
                    <span className="text-sm font-medium text-stone-800">
                      {formatInUserTz(step.at, appTz)}
                    </span>
                    {step.label && step.label !== STEP_LABELS[step.type] && (
                      <span className="text-xs text-stone-500">{step.label}</span>
                    )}
                  </li>
                ))}
            </ul>
            <div className="rounded border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-600">
                Peak window: {formatTimeInTz(plan.peakWindowStart, appTz)} – {formatTimeInTz(plan.peakWindowEnd, appTz)}
                {" · "}
                Time to peak at room temp: {plan.timeToPeakMinutes} min
              </p>
              {plan.retardEnabled && plan.fridgeInAt && plan.fridgeOutAt && (
                <p className="mt-1 text-xs text-stone-500">
                  Fridge: {formatTimeInTz(plan.fridgeInAt, appTz)} → {formatTimeInTz(plan.fridgeOutAt, appTz)}
                </p>
              )}
            </div>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={startBake}
                disabled={starting}
                className="rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
              >
                {starting ? "Starting…" : "Start this bake"}
              </button>
              <p className="text-xs text-stone-500">
                Creates a bake with mix at {formatTimeInTz(plan.mixTime, appTz)} and saves this plan.
              </p>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
