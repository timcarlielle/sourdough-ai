"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { dateTimeLocalStringToISO, formatInUserTz, formatForDateTimeLocalInput, getNowForDateTimeLocalInput } from "@/lib/timezone";
import { useUserTimezone } from "@/lib/use-user-timezone";
import {
  QUICK_ADD_TYPES,
  labelForEventType,
  displayLabelForEvent,
  EVENT_TYPES_BY_PHASE,
  PHASE_LABELS,
  type BakeEventPhase,
} from "@/lib/bake-events";

export type BakeEvent = {
  id: string;
  eventType: string;
  occurredAt: string;
  eventPhase: string;
  sequenceIndex: number | null;
  metadata: Record<string, unknown> | null;
  notes: string | null;
};

type CustomEventType = { id: string; eventType: string; label: string; phase: string };

export function BakeTimeline({
  bakeId,
  events: initialEvents,
  customEventTypes = [],
}: {
  bakeId: string;
  events: BakeEvent[];
  customEventTypes?: CustomEventType[];
}) {
  const router = useRouter();
  const tz = useUserTimezone();
  const [events, setEvents] = useState(initialEvents);

  useEffect(() => {
    setEvents(initialEvents);
  }, [initialEvents]);

  const [showAddForm, setShowAddForm] = useState(false);
  const [addEventType, setAddEventType] = useState("");
  const [addOccurredAt, setAddOccurredAt] = useState(() => getNowForDateTimeLocalInput(tz));
  const [addNotes, setAddNotes] = useState("");
  const [addMetadata, setAddMetadata] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editOccurredAt, setEditOccurredAt] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const grouped = events.reduce<Record<string, BakeEvent[]>>((acc, e) => {
    const p = e.eventPhase || "custom";
    if (!acc[p]) acc[p] = [];
    acc[p].push(e);
    return acc;
  }, {});

  const phaseOrder: BakeEventPhase[] = [
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

  async function quickAdd(eventType: string) {
    const res = await fetch(`/api/bakes/${bakeId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: eventType,
        occurred_at: dateTimeLocalStringToISO(addOccurredAt, tz),
        notes: null,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setEvents((prev) => [...prev, created].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()));
      router.refresh();
    }
  }

  async function submitAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!addEventType.trim()) return;
    const metadata = addMetadata.trim() ? (() => { try { return JSON.parse(addMetadata) as Record<string, unknown>; } catch { return null; } })() : null;
    const res = await fetch(`/api/bakes/${bakeId}/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event_type: addEventType.trim(),
        occurred_at: dateTimeLocalStringToISO(addOccurredAt, tz),
        notes: addNotes.trim() || null,
        metadata,
      }),
    });
    if (res.ok) {
      const created = await res.json();
      setEvents((prev) => [...prev, created].sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()));
      setShowAddForm(false);
      setAddEventType("");
      setAddOccurredAt(getNowForDateTimeLocalInput(tz));
      setAddNotes("");
      setAddMetadata("");
      router.refresh();
    }
  }

  async function saveEdit(eventId: string) {
    const res = await fetch(`/api/bake-events/${eventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occurred_at: dateTimeLocalStringToISO(editOccurredAt, tz) }),
    });
    if (res.ok) {
      const updated = await res.json();
      setEvents((prev) => prev.map((ev) => (ev.id === eventId ? updated : ev)).sort((a, b) => new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime()));
      setEditingId(null);
      router.refresh();
    }
  }

  async function deleteEvent(eventId: string) {
    if (!confirm("Delete this event?")) return;
    const res = await fetch(`/api/bake-events/${eventId}`, { method: "DELETE" });
    if (res.ok) {
      setEvents((prev) => prev.filter((ev) => ev.id !== eventId));
      router.refresh();
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="font-medium text-stone-800">Process timeline</h2>
        <div className="flex flex-wrap gap-1">
          {QUICK_ADD_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => quickAdd(t)}
              className="rounded border border-stone-300 bg-white px-2 py-1 text-sm text-stone-700 hover:bg-stone-50"
            >
              {labelForEventType(t)}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="rounded bg-amber-800 px-3 py-1 text-sm text-white hover:bg-amber-900"
        >
          {showAddForm ? "Cancel" : "Add event"}
        </button>
      </div>

      {showAddForm && (
        <form onSubmit={submitAdd} className="rounded border border-stone-200 bg-stone-50 p-4 space-y-3">
          <div>
            <label className="block text-sm font-medium text-stone-700">Event type</label>
            <select
              value={addEventType}
              onChange={(e) => setAddEventType(e.target.value)}
              className="mt-1 w-full max-w-md rounded border border-stone-300 px-3 py-2"
            >
              <option value="">— Select —</option>
              {phaseOrder.map((phase) => {
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
          <div>
            <label className="block text-sm font-medium text-stone-700">Metadata JSON (optional)</label>
            <textarea
              value={addMetadata}
              onChange={(e) => setAddMetadata(e.target.value)}
              placeholder='{"fold_number": 2}'
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2 font-mono text-sm"
              rows={2}
            />
          </div>
          <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900">
            Save event
          </button>
        </form>
      )}

      <div className="relative border-l-2 border-stone-200 pl-4">
        {phaseOrder.map((phase) => {
          const list = grouped[phase] || [];
          if (list.length === 0) return null;
          return (
            <div key={phase} className="mb-6">
              <h3 className="text-xs font-semibold uppercase tracking text-stone-400">
                {PHASE_LABELS[phase]}
              </h3>
              <ul className="mt-2 space-y-2">
                {list.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded border border-stone-200 bg-white py-2 pr-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        {editingId === ev.id ? (
                          <div className="flex items-center gap-2">
                            <input
                              type="datetime-local"
                              value={editOccurredAt}
                              onChange={(e) => setEditOccurredAt(e.target.value)}
                              className="rounded border border-stone-300 px-2 py-1 text-sm"
                            />
                            <button
                              type="button"
                              onClick={() => saveEdit(ev.id)}
                              className="text-amber-800 hover:underline"
                            >
                              Save
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingId(null)}
                              className="text-stone-500 hover:underline"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span
                            className="cursor-pointer text-stone-600 hover:text-stone-900"
                            onClick={() => {
                              setEditingId(ev.id);
                              setEditOccurredAt(formatForDateTimeLocalInput(ev.occurredAt, tz));
                            }}
                            title="Click to edit time"
                          >
                            {formatInUserTz(ev.occurredAt, tz)}
                          </span>
                        )}
                        <span className="ml-2 font-medium text-stone-800">
                          {displayLabelForEvent(ev)}
                        </span>
                        {ev.notes && <span className="ml-2 text-stone-500">— {ev.notes}</span>}
                      </div>
                      <div className="flex items-center gap-1">
                        {ev.metadata && Object.keys(ev.metadata).length > 0 && (
                          <button
                            type="button"
                            onClick={() => setExpandedId(expandedId === ev.id ? null : ev.id)}
                            className="rounded px-2 py-0.5 text-xs text-stone-500 hover:bg-stone-100"
                          >
                            {expandedId === ev.id ? "Hide" : "Metadata"}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => deleteEvent(ev.id)}
                          className="text-red-600 hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {expandedId === ev.id && ev.metadata && (
                      <pre className="mt-2 overflow-x-auto rounded bg-stone-100 p-2 text-xs text-stone-600">
                        {JSON.stringify(ev.metadata, null, 2)}
                      </pre>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
      {events.length === 0 && !showAddForm && (
        <p className="text-stone-500">No events yet. Use quick-add or Add event to build the timeline.</p>
      )}
    </div>
  );
}
