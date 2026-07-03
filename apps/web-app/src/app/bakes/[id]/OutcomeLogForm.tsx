"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const RATINGS = [
  { key: "crumbOpennessRating", label: "Crumb openness" },
  { key: "crumbTextureRating", label: "Crumb texture" },
  { key: "crustColorRating", label: "Crust color" },
  { key: "crustThicknessRating", label: "Crust thickness" },
  { key: "ovenSpringRating", label: "Oven spring" },
  { key: "sournessRating", label: "Sourness" },
  { key: "appearanceRating", label: "Appearance" },
  { key: "overallRating", label: "Overall" },
] as const;

const TOGGLES = [
  { key: "tooSour", label: "Too sour" },
  { key: "underproofed", label: "Underproofed" },
  { key: "overproofed", label: "Overproofed" },
  { key: "dense", label: "Dense" },
  { key: "gummy", label: "Gummy" },
] as const;

type RatingKey = (typeof RATINGS)[number]["key"];
type ToggleKey = (typeof TOGGLES)[number]["key"];

export type ExistingOutcome = {
  id: string;
  crumbOpennessRating?: number | null;
  crumbTextureRating?: number | null;
  crustColorRating?: number | null;
  crustThicknessRating?: number | null;
  ovenSpringRating?: number | null;
  sournessRating?: number | null;
  appearanceRating?: number | null;
  overallRating?: number | null;
  tooSour?: boolean;
  underproofed?: boolean;
  overproofed?: boolean;
  dense?: boolean;
  gummy?: boolean;
  freeformNotes?: string | null;
};

function defaultRatings(): Record<RatingKey, number | ""> {
  return RATINGS.reduce((acc, { key }) => ({ ...acc, [key]: "" }), {} as Record<RatingKey, number | "">);
}

function defaultToggles(): Record<ToggleKey, boolean> {
  return TOGGLES.reduce((acc, { key }) => ({ ...acc, [key]: false }), {} as Record<ToggleKey, boolean>);
}

function ratingsFromOutcome(o: ExistingOutcome | null): Record<RatingKey, number | ""> {
  const r = defaultRatings();
  if (!o) return r;
  RATINGS.forEach(({ key }) => {
    const v = o[key as keyof ExistingOutcome];
    if (typeof v === "number" && v >= 1 && v <= 5) r[key] = v;
  });
  return r;
}

function togglesFromOutcome(o: ExistingOutcome | null): Record<ToggleKey, boolean> {
  if (!o) return defaultToggles();
  return {
    tooSour: o.tooSour ?? false,
    underproofed: o.underproofed ?? false,
    overproofed: o.overproofed ?? false,
    dense: o.dense ?? false,
    gummy: o.gummy ?? false,
  };
}

export function OutcomeLogForm({ bakeId, existingOutcome = null }: { bakeId: string; existingOutcome?: ExistingOutcome | null }) {
  const router = useRouter();
  const [ratings, setRatings] = useState<Record<RatingKey, number | "">>(() => ratingsFromOutcome(existingOutcome));
  const [toggles, setToggles] = useState<Record<ToggleKey, boolean>>(() => togglesFromOutcome(existingOutcome));
  const [notes, setNotes] = useState(existingOutcome?.freeformNotes ?? "");
  const [submitting, setSubmitting] = useState(false);

  const outcomeSnapshot = existingOutcome === null ? null : JSON.stringify({
    id: existingOutcome.id,
    ...ratingsFromOutcome(existingOutcome),
    ...togglesFromOutcome(existingOutcome),
    notes: existingOutcome.freeformNotes ?? "",
  });
  useEffect(() => {
    setRatings(ratingsFromOutcome(existingOutcome));
    setToggles(togglesFromOutcome(existingOutcome));
    setNotes(existingOutcome?.freeformNotes ?? "");
  }, [outcomeSnapshot]);

  function setRating(k: RatingKey, v: number | "") {
    setRatings((prev) => ({ ...prev, [k]: v }));
  }

  function setToggle(k: ToggleKey, v: boolean) {
    setToggles((prev) => ({ ...prev, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    const body: Record<string, unknown> = {
      freeformNotes: notes || null,
      ...toggles,
    };
    if (existingOutcome?.id) body.outcomeId = existingOutcome.id;
    RATINGS.forEach(({ key }) => {
      const val = ratings[key];
      if (val !== "" && val >= 1 && val <= 5) body[key] = val;
    });
    try {
      const res = await fetch(`/api/bakes/${bakeId}/outcomes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        router.refresh();
        if (!existingOutcome?.id) {
          setRatings(defaultRatings());
          setToggles(defaultToggles());
          setNotes("");
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <p className="text-xs text-stone-500">Rate 1–5 (optional). Toggle issues. Add notes. &lt; 1 min.</p>
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        {RATINGS.map(({ key, label }) => (
          <div key={key} className="flex flex-col gap-0.5">
            <label className="text-xs font-medium text-stone-600">{label}</label>
            <div className="flex items-center gap-1">
              <input
                type="range"
                min={1}
                max={5}
                step={1}
                value={ratings[key] === "" ? 3 : ratings[key]}
                onChange={(e) => setRating(key, e.target.value === "" ? "" : Number(e.target.value))}
                className="h-2 flex-1 accent-amber-600"
              />
              <span className="w-5 text-right text-xs tabular-nums text-stone-500">
                {ratings[key] === "" ? "—" : ratings[key]}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {TOGGLES.map(({ key, label }) => (
          <label key={key} className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-stone-200 bg-white px-3 py-1.5 text-sm hover:bg-stone-50">
            <input
              type="checkbox"
              checked={toggles[key]}
              onChange={(e) => setToggle(key, e.target.checked)}
              className="rounded border-stone-300 accent-amber-600"
            />
            {label}
          </label>
        ))}
      </div>
      <div>
        <label className="text-xs font-medium text-stone-600">Notes</label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Quick notes…"
          rows={2}
          className="mt-0.5 w-full rounded border border-stone-300 px-3 py-2 text-sm"
        />
      </div>
      <button
        type="submit"
        disabled={submitting}
        className="rounded bg-amber-700 px-4 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
      >
        {submitting ? "Saving…" : existingOutcome ? "Update outcome" : "Log outcome"}
      </button>
    </form>
  );
}
