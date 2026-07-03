"use client";

import { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { dateTimeLocalStringToISO, formatInUserTz, getNowForDateTimeLocalInput } from "@/lib/timezone";
import { useUserTimezone } from "@/lib/use-user-timezone";
import {
  EVENT_TYPES_BY_PHASE,
  PHASE_LABELS,
  displayLabelForStep,
  displayLabelForEvent,
  labelForEventType,
  isPhaseTracked,
  effectivePhaseForStep,
  isPrepEventType,
  isBakingPrepStep,
  isStarterPrepStep,
  type BakeEventPhase,
} from "@/lib/bake-events";

type RecipeStep = {
  id: string;
  section: string;
  stepText: string;
  sortOrder: number;
  estimatedMinutesFromStart: number | null;
  eventType: string | null;
  eventPhase: string | null;
};

type RecipeNote = {
  id: string;
  category: string;
  noteText: string;
  sortOrder: number;
};

type BakeEvent = {
  id: string;
  eventType: string;
  occurredAt: string;
  eventPhase: string;
  sequenceIndex: number | null;
  metadata: Record<string, unknown> | null;
  notes: string | null;
};

const PHASE_ORDER: BakeEventPhase[] = [
  "mixing",
  "bulk_fermentation",
  "dividing",
  "shaping",
  "proofing",
  "baking",
  "cooling",
  "evaluation",
  "environment",
  "custom",
];

type RecipeStepItem = {
  kind: "recipe_step";
  step: RecipeStep;
  scheduledAt: Date;
  completedEvent: BakeEvent | null;
  status: "completed" | "missed" | "current" | "upcoming";
  sectionNotes: RecipeNote[];
  isTracked: boolean;
  isPrep: boolean;
  isStarterPrep: boolean;
};

type TimelineItem = RecipeStepItem | { kind: "logged_only"; event: BakeEvent };

function buildTimeline(
  startedAt: Date,
  now: Date,
  steps: RecipeStep[],
  recipeNotes: RecipeNote[],
  events: BakeEvent[],
  trackedPhases: string[] | null
): TimelineItem[] {
  const items: TimelineItem[] = [];
  const eventsByType = new Map<string, BakeEvent[]>();
  for (const e of events) {
    if (!isPhaseTracked(e.eventPhase, trackedPhases)) continue;
    const list = eventsByType.get(e.eventType) ?? [];
    list.push(e);
    eventsByType.set(e.eventType, list);
  }
  for (const list of eventsByType.values()) {
    list.sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime());
  }

  const stepsWithTime = steps.filter((s) => s.estimatedMinutesFromStart != null);
  const usedEventIds = new Set<string>();

  for (const step of stepsWithTime) {
    const minutes = step.estimatedMinutesFromStart!;
    const scheduledAt = new Date(startedAt.getTime() + minutes * 60 * 1000);
    const eventType = step.eventType ?? "note";
    const isTracked = isPhaseTracked(effectivePhaseForStep(step), trackedPhases);
    const isStarterPrep = isStarterPrepStep(step, step.sortOrder);
    const isPrep = isStarterPrep || isPrepEventType(step.eventType) || isBakingPrepStep(step);
    const showLogUi = isTracked && !isPrep;

    const candidates = (eventsByType.get(eventType) ?? []).filter((e) => !usedEventIds.has(e.id));
    const completedEvent = showLogUi ? (candidates[0] ?? null) : null;
    if (completedEvent) usedEventIds.add(completedEvent.id);

    const isPast = scheduledAt.getTime() < now.getTime();
    const status: RecipeStepItem["status"] =
      completedEvent ? "completed" : isPast ? "missed" : "upcoming";

    items.push({
      kind: "recipe_step",
      step,
      scheduledAt,
      completedEvent,
      status,
      sectionNotes: [],
      isTracked,
      isPrep,
      isStarterPrep,
    });
  }

  const scheduledTimes = new Set(stepsWithTime.map((s) => s.estimatedMinutesFromStart));
  for (const e of events) {
    if (!isPhaseTracked(e.eventPhase, trackedPhases)) continue;
    if (usedEventIds.has(e.id)) continue;
    items.push({ kind: "logged_only", event: e });
  }

  items.sort((a, b) => {
    const timeA = a.kind === "recipe_step" ? a.scheduledAt.getTime() : new Date(a.event.occurredAt).getTime();
    const timeB = b.kind === "recipe_step" ? b.scheduledAt.getTime() : new Date(b.event.occurredAt).getTime();
    if (timeA !== timeB) return timeA - timeB;
    // Same time: keep recipe order (recipe_step by sortOrder, logged_only after steps)
    if (a.kind === "recipe_step" && b.kind === "recipe_step")
      return a.step.sortOrder - b.step.sortOrder;
    if (a.kind === "recipe_step") return -1;
    if (b.kind === "recipe_step") return 1;
    return 0;
  });

  const firstUncompletedIndex = items.findIndex(
    (i) =>
      i.kind === "recipe_step" &&
      i.status !== "completed" &&
      i.isTracked &&
      !i.isPrep &&
      !i.isStarterPrep
  );
  if (firstUncompletedIndex >= 0 && items[firstUncompletedIndex].kind === "recipe_step") {
    (items[firstUncompletedIndex] as RecipeStepItem).status = "current";
  }

  return items;
}

type CustomEventType = { id: string; eventType: string; label: string; phase: string };

type RecipeIngredient = { id: string; name: string; amountG: number | null; bakerPct: number | null; notes: string | null };

type Props = {
  bakeId: string;
  startedAt: string;
  endedAt: string | null;
  recipe: {
    steps: RecipeStep[];
    recipeNotes: RecipeNote[];
    ingredients?: RecipeIngredient[];
  };
  events: BakeEvent[];
  trackedPhases?: string[] | null;
  customEventTypes?: CustomEventType[];
  starterCycleId?: string | null;
};

export function ActiveBakeTimeline({ bakeId, startedAt, endedAt, recipe, events, trackedPhases, customEventTypes = [], starterCycleId = null }: Props) {
  const router = useRouter();
  const tz = useUserTimezone();
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [addEventType, setAddEventType] = useState("");
  const [addOccurredAt, setAddOccurredAt] = useState(() => getNowForDateTimeLocalInput(tz));
  const [addNotes, setAddNotes] = useState("");
  const [starterReady, setStarterReady] = useState<{
    ready: boolean;
    message: string;
    debug?: Record<string, unknown>;
  } | null>(null);
  const hasStarterPrepStep = useMemo(
    () => recipe.steps.some((s) => isStarterPrepStep(s, s.sortOrder)),
    [recipe.steps]
  );
  useEffect(() => {
    if (!hasStarterPrepStep) return;
    const params = new URLSearchParams();
    if (starterCycleId) params.set("starterCycleId", starterCycleId);
    params.set("debug", "1");
    const url = `/api/planning/starter-ready?${params.toString()}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => {
        if (d.ready == null) {
          setStarterReady(null);
          return;
        }
        setStarterReady({
          ready: !!d.ready,
          message: d.message ?? "",
          debug: d.debug ?? undefined,
        });
      })
      .catch(() => setStarterReady(null));
  }, [hasStarterPrepStep, starterCycleId]);

  const started = useMemo(() => new Date(startedAt), [startedAt]);
  const [tick, setTick] = useState(0);
  const isActive = !endedAt;

  // Recompute timeline every minute so "current" / "missed" stay accurate
  useEffect(() => {
    if (!isActive) return;
    const id = setInterval(() => setTick((t) => t + 1), 60 * 1000);
    return () => clearInterval(id);
  }, [isActive]);

  const timeline = useMemo(
    () =>
      buildTimeline(
        started,
        new Date(),
        recipe.steps,
        recipe.recipeNotes,
        events,
        trackedPhases ?? null
      ),
    [started, recipe.steps, recipe.recipeNotes, events, tick, trackedPhases]
  );

  async function logStep(step: RecipeStep, scheduledAt: Date) {
    const eventType = step.eventType ?? "note";
    const eventPhase = (step.eventPhase ?? "custom") as BakeEventPhase;
    const res = await fetch(`/api/bakes/${bakeId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: eventType,
        occurred_at: new Date().toISOString(),
        event_phase: eventPhase,
        notes: null,
      }),
    });
    if (res.ok) {
      router.refresh();
    }
  }

  async function deleteEvent(eventId: string) {
    if (!confirm("Remove this logged event?")) return;
    const res = await fetch(`/api/bake-events/${eventId}`, { method: "DELETE" });
    if (res.ok) router.refresh();
  }

  async function submitAddCustom(e: React.FormEvent) {
    e.preventDefault();
    if (!addEventType.trim()) return;
    const res = await fetch(`/api/bakes/${bakeId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: addEventType.trim(),
        occurred_at: dateTimeLocalStringToISO(addOccurredAt, tz),
        notes: addNotes.trim() || null,
      }),
    });
    if (res.ok) {
      setShowAddCustom(false);
      setAddEventType("");
      setAddOccurredAt(getNowForDateTimeLocalInput(tz));
      setAddNotes("");
      router.refresh();
    }
  }

  const statusStyles = {
    completed: "border-green-300 bg-green-50 text-green-900",
    missed: "border-red-300 bg-red-50 text-red-900",
    current: "border-amber-400 bg-amber-50 text-amber-900 ring-2 ring-amber-300",
    upcoming: "border-stone-200 bg-white text-stone-800",
  };

  const statusBadge = {
    completed: "bg-green-600 text-white",
    missed: "bg-red-600 text-white",
    current: "bg-amber-600 text-white",
    upcoming: "bg-stone-400 text-white",
  };

  if (recipe.steps.length === 0) return null;

  const hasScheduledSteps = recipe.steps.some((s) => s.estimatedMinutesFromStart != null);
  if (!hasScheduledSteps) return null;

  return (
    <div className="space-y-4">
      {recipe.recipeNotes.length > 0 && (
        <details className="rounded-lg border border-stone-200 bg-stone-50/50">
          <summary className="cursor-pointer px-4 py-3 font-medium text-stone-700">
            Recipe notes ({recipe.recipeNotes.length})
          </summary>
          <ul className="border-t border-stone-200 px-4 py-3 space-y-2 text-sm text-stone-600">
            {recipe.recipeNotes.map((n) => (
              <li key={n.id}>
                <span className="font-medium text-stone-500">[{n.category}]</span> {n.noteText}
              </li>
            ))}
          </ul>
        </details>
      )}

      {starterReady?.debug && (
        <details className="rounded-lg border border-amber-200 bg-amber-50/50" open>
          <summary className="cursor-pointer px-4 py-2 text-sm font-medium text-amber-800">
            Starter readiness debug
          </summary>
          <pre className="border-t border-amber-200 px-4 py-3 text-xs text-stone-700 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(starterReady.debug, null, 2)}
          </pre>
        </details>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-stone-800">Bake timeline</h2>
        {isActive && (
          <p className="text-sm text-stone-500">
            Started {formatInUserTz(startedAt, tz)} · Use “Log step” when you complete each one
          </p>
        )}
        <button
          type="button"
          onClick={() => setShowAddCustom((v) => !v)}
          className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-800"
        >
          {showAddCustom ? "Cancel" : "Add custom step"}
        </button>
      </div>

      {showAddCustom && (
        <form onSubmit={submitAddCustom} className="rounded-lg border border-stone-200 bg-stone-50 p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-stone-700">Event type</label>
            <select
              value={addEventType}
              onChange={(e) => setAddEventType(e.target.value)}
              className="mt-1 w-full max-w-md rounded border border-stone-300 px-3 py-2"
            >
              <option value="">— Select —</option>
              {PHASE_ORDER.map((phase) => {
                const systemTypes = EVENT_TYPES_BY_PHASE[phase] as readonly string[];
                const customForPhase = customEventTypes.filter((c) => c.phase === phase);
                if (systemTypes.length === 0 && customForPhase.length === 0) return null;
                return (
                  <optgroup key={phase} label={PHASE_LABELS[phase]}>
                    {systemTypes.map((t) => (
                      <option key={t} value={t}>
                        {labelForEventType(t)}
                      </option>
                    ))}
                    {customForPhase.map((c) => (
                      <option key={c.id} value={c.eventType}>
                        {c.label}
                      </option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Time</label>
            <input
              type="datetime-local"
              value={addOccurredAt}
              onChange={(e) => setAddOccurredAt(e.target.value)}
              className="mt-1 rounded border border-stone-300 px-3 py-2"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Notes (optional)</label>
            <input
              type="text"
              value={addNotes}
              onChange={(e) => setAddNotes(e.target.value)}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
          <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900">
            Add step
          </button>
        </form>
      )}

      <div className="relative space-y-0">
        {timeline.map((item, index) => {
          if (item.kind === "logged_only") {
            return (
              <div
                key={item.event.id}
                className="relative flex gap-4 py-3 pl-8 before:absolute before:left-[11px] before:top-8 before:bottom-0 before:w-0.5 before:bg-stone-200 last:before:hidden"
              >
                <div className="absolute left-0 top-5 h-4 w-4 rounded-full border-2 border-stone-300 bg-stone-100" />
                <div className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-stone-50/50 px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-stone-500">{formatInUserTz(item.event.occurredAt, tz)}</span>
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                        Logged
                      </span>
                      <button
                        type="button"
                        onClick={() => deleteEvent(item.event.id)}
                        className="text-red-600 text-xs hover:underline"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <p className="mt-1 font-medium text-stone-800">
                    {displayLabelForEvent(item.event)}
                  </p>
                  {item.event.notes && <p className="mt-1 text-sm text-stone-600">{item.event.notes}</p>}
                </div>
              </div>
            );
          }

          const { step, scheduledAt, completedEvent, status, isTracked, isPrep, isStarterPrep } = item;
          const label = displayLabelForStep(step);
          const showLogUi = isTracked && !isPrep;
          const neutralStep = !showLogUi;
          const ingredients = recipe.ingredients ?? [];
          const showIngredients = !isStarterPrep && (step.section?.toLowerCase() === "mixing" || (step.eventPhase?.toLowerCase() === "mixing")) && ingredients.length > 0;

          return (
            <div
              key={step.id}
              className={`relative flex gap-4 py-3 pl-8 before:absolute before:left-[11px] before:top-8 before:bottom-0 before:w-0.5 before:bg-stone-200 last:before:hidden`}
            >
              <div
                className={`absolute left-0 top-5 h-4 w-4 rounded-full border-2 ${
                  neutralStep
                    ? "border-stone-300 bg-stone-100"
                    : status === "completed"
                    ? "border-green-500 bg-green-500"
                    : status === "missed"
                    ? "border-red-500 bg-red-500"
                    : status === "current"
                    ? "border-amber-500 bg-amber-500 animate-pulse"
                    : "border-stone-300 bg-white"
                }`}
              />
              <div
                className={`min-w-0 flex-1 rounded-lg border px-4 py-3 ${
                  neutralStep
                    ? "border-stone-200 bg-stone-50/50 text-stone-800"
                    : statusStyles[status]
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-medium text-stone-600">
                    {formatInUserTz(scheduledAt.toISOString(), tz)}
                  </span>
                  {showLogUi ? (
                    <span
                      className={`rounded px-2 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusBadge[status]}`}
                    >
                      {status === "completed" && "Done"}
                      {status === "missed" && "Missed"}
                      {status === "current" && "Now"}
                      {status === "upcoming" && "Upcoming"}
                    </span>
                  ) : isStarterPrep ? (
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                      We&apos;re monitoring
                    </span>
                  ) : isPrep ? (
                    <span className="rounded bg-stone-200 px-2 py-0.5 text-xs font-medium text-stone-600">
                      Prep
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 font-semibold text-stone-900">
                  {isStarterPrep ? "Starter: use when ready" : label}
                  {isPrep && !isStarterPrep && (
                    <span className="ml-2 font-normal text-stone-500">(prep)</span>
                  )}
                </p>
                {isStarterPrep && starterReady?.message && (
                  <p className="mt-2 text-amber-800 font-medium">{starterReady.message}</p>
                )}
                <p className="mt-2 text-stone-700">{step.stepText}</p>
                {showIngredients && (
                  <ul className="mt-2 list-disc pl-4 text-sm text-stone-600">
                    {ingredients.map((i) => (
                      <li key={i.id}>
                        {i.name}
                        {i.amountG != null && ` — ${i.amountG}g`}
                        {i.bakerPct != null && ` (${i.bakerPct}%)`}
                        {i.notes && ` — ${i.notes}`}
                      </li>
                    ))}
                  </ul>
                )}
                {completedEvent && (
                  <p className="mt-2 text-sm text-stone-500">
                    Logged at {formatInUserTz(completedEvent.occurredAt, tz)}
                    {completedEvent.notes && ` — ${completedEvent.notes}`}
                  </p>
                )}
                {showLogUi && isActive && status !== "completed" && (
                  <div className="mt-3">
                    <button
                      type="button"
                      onClick={() => logStep(step, scheduledAt)}
                      className="rounded bg-amber-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-900"
                    >
                      Log step
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
