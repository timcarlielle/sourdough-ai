"use client";

import { useEffect, useState } from "react";
import {
  BAKE_EVENT_PHASES,
  PHASE_LABELS,
  PHASE_EVENT_SUMMARY,
  type BakeEventPhase,
} from "@/lib/bake-events";

type CustomType = {
  id: string;
  eventType: string;
  label: string;
  phase: string;
  sortOrder: number;
};

type Settings = {
  trackedPhases: string[] | null;
  customEventTypes: CustomType[];
};

export function BakeTimelineSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingPhases, setSavingPhases] = useState(false);
  const [phaseMessage, setPhaseMessage] = useState<"saved" | "error" | null>(null);
  const [showAddCustom, setShowAddCustom] = useState(false);
  const [newSlug, setNewSlug] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newPhase, setNewPhase] = useState<BakeEventPhase>("baking");
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    fetch("/api/bake-settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings({
          trackedPhases: d.trackedPhases ?? null,
          customEventTypes: d.customEventTypes ?? [],
        });
      })
      .catch(() => setSettings({ trackedPhases: null, customEventTypes: [] }))
      .finally(() => setLoading(false));
  }, []);

  const trackedArr = settings?.trackedPhases ?? null;
  const trackedSet = new Set(trackedArr ?? []);
  const trackAll = trackedArr === null || trackedSet.size === BAKE_EVENT_PHASES.length;

  async function togglePhase(phase: BakeEventPhase, checked: boolean) {
    if (!settings) return;
    let next: string[] | null;
    if (checked) {
      const base: string[] = trackedArr === null ? [...BAKE_EVENT_PHASES] : [...trackedSet];
      const withPhase = base.includes(phase) ? base : [...base, phase];
      next = withPhase.length === BAKE_EVENT_PHASES.length ? null : withPhase;
    } else {
      const without = (trackedArr === null ? [...BAKE_EVENT_PHASES] : [...trackedSet]).filter((p) => p !== phase);
      next = without.length === 0 ? [] : without;
    }
    setSavingPhases(true);
    setPhaseMessage(null);
    try {
      const res = await fetch("/api/bake-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackedPhases: next }),
      });
      if (res.ok) {
        setSettings((s) => (s ? { ...s, trackedPhases: next } : s));
        setPhaseMessage("saved");
      } else {
        setPhaseMessage("error");
      }
    } catch {
      setPhaseMessage("error");
    } finally {
      setSavingPhases(false);
    }
  }

  async function addCustom() {
    const slug = newSlug.trim().toLowerCase().replace(/\s+/g, "_");
    if (!slug || !newLabel.trim()) return;
    setAdding(true);
    try {
      const res = await fetch("/api/custom-event-types", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          eventType: slug,
          label: newLabel.trim(),
          phase: newPhase,
          sortOrder: (settings?.customEventTypes?.length ?? 0),
        }),
      });
      if (res.ok) {
        const created = await res.json();
        setSettings((s) =>
          s
            ? {
                ...s,
                customEventTypes: [...(s.customEventTypes ?? []), created],
              }
            : s
        );
        setShowAddCustom(false);
        setNewSlug("");
        setNewLabel("");
      }
    } finally {
      setAdding(false);
    }
  }

  async function deleteCustom(id: string) {
    if (!confirm("Remove this event type? It will no longer be offered when parsing recipes.")) return;
    const res = await fetch(`/api/custom-event-types/${id}`, { method: "DELETE" });
    if (res.ok) {
      setSettings((s) =>
        s
          ? {
              ...s,
              customEventTypes: s.customEventTypes.filter((t) => t.id !== id),
            }
            : s
      );
    }
  }

  if (loading || !settings) {
    return (
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <p className="text-stone-500">Loading bake timeline settings…</p>
      </div>
    );
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-medium text-stone-800">Bake timeline</h2>
        <p className="mt-1 text-sm text-stone-500">
          Choose which phases appear in the bake timeline and dashboard. Untracked phases still show in the recipe page but not in timelines. Each phase includes specific event types (e.g. Mixing includes mix, autolyse, salt; Bulk fermentation includes folds).
        </p>
        <div className="mt-3 space-y-2">
          {BAKE_EVENT_PHASES.map((phase) => {
            const checked = trackAll || trackedSet.has(phase);
            return (
              <label key={phase} className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => togglePhase(phase, e.target.checked)}
                  disabled={savingPhases}
                  className="mt-1 rounded border-stone-300"
                />
                <span className="text-sm text-stone-800">
                  <span className="font-medium">{PHASE_LABELS[phase]}</span>
                  <span className="ml-1.5 text-stone-500">({PHASE_EVENT_SUMMARY[phase]})</span>
                </span>
              </label>
            );
          })}
        </div>
        {phaseMessage === "saved" && <p className="mt-2 text-sm text-green-600">Saved.</p>}
        {phaseMessage === "error" && <p className="mt-2 text-sm text-red-600">Failed to save.</p>}
      </div>

      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <h2 className="text-lg font-medium text-stone-800">Custom event types</h2>
        <p className="mt-1 text-sm text-stone-500">
          Add event types (e.g. steam) that the app can use when parsing recipes and when you log steps. They will appear in the timeline under the phase you choose.
        </p>
        <ul className="mt-3 space-y-2">
          {settings.customEventTypes.map((t) => (
            <li
              key={t.id}
              className="flex items-center justify-between rounded border border-stone-100 bg-stone-50/50 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium text-stone-800">{t.label}</span>
                <span className="ml-2 text-stone-500">({t.eventType})</span>
                <span className="ml-2 text-stone-400">— {PHASE_LABELS[t.phase as BakeEventPhase]}</span>
              </span>
              <button
                type="button"
                onClick={() => deleteCustom(t.id)}
                className="text-red-600 hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        {!showAddCustom ? (
          <button
            type="button"
            onClick={() => setShowAddCustom(true)}
            className="mt-3 rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-800"
          >
            Add event type
          </button>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              addCustom();
            }}
            className="mt-3 space-y-2 rounded border border-stone-200 bg-stone-50/50 p-3"
          >
            <div>
              <label className="block text-xs font-medium text-stone-600">Slug (e.g. steam_added)</label>
              <input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                placeholder="steam_added"
                className="mt-1 w-full max-w-xs rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600">Label</label>
              <input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="Steam added"
                className="mt-1 w-full max-w-xs rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-600">Phase</label>
              <select
                value={newPhase}
                onChange={(e) => setNewPhase(e.target.value as BakeEventPhase)}
                className="mt-1 rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                {BAKE_EVENT_PHASES.map((p) => (
                  <option key={p} value={p}>
                    {PHASE_LABELS[p]}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={adding || !newSlug.trim() || !newLabel.trim()}
                className="rounded bg-amber-800 px-3 py-1.5 text-sm text-white hover:bg-amber-900 disabled:opacity-50"
              >
                Add
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowAddCustom(false);
                  setNewSlug("");
                  setNewLabel("");
                }}
                className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-100"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
