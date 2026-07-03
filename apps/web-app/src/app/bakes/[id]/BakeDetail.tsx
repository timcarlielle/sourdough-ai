"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VoiceLogWidget } from "@/components/VoiceLogWidget";
import { dateTimeLocalStringToISO, formatInUserTz, getNowForDateTimeLocalInput } from "@/lib/timezone";
import { BakeTimeline, type BakeEvent } from "./BakeTimeline";
import { ActiveBakeTimeline } from "./ActiveBakeTimeline";
import { OutcomeLogForm } from "./OutcomeLogForm";
import { RecommendationsBlock } from "./RecommendationsBlock";

const MILESTONE_TYPES = ["mix", "autolyse_start", "salt_added", "fold", "shape", "proof_start", "fridge", "bake_in", "bake_out", "score", "steam_on", "steam_off", "other"] as const;

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

type Bake = {
  id: string;
  startedAt: string;
  endedAt: string | null;
  doughBatchName: string | null;
  notes: string | null;
  recipe: {
    title: string;
    steps?: RecipeStep[];
    recipeNotes?: RecipeNote[];
    ingredients?: { id: string; name: string; amountG: number | null; bakerPct: number | null; notes: string | null }[];
  };
  starterCycle: { id: string } | null;
  doughDevice: { name: string } | null;
  milestones: { id: string; milestoneType: string; occurredAt: string; notes: string | null }[];
  events: BakeEvent[];
  outcomes: {
    id: string;
    overallRating: number | null;
    sournessRating: number | null;
    crumbOpennessRating: number | null;
    ovenSpringRating: number | null;
    tooSour: boolean;
    underproofed: boolean;
    overproofed: boolean;
    dense: boolean;
    gummy: boolean;
    freeformNotes: string | null;
  }[];
};

type CustomEventType = { id: string; eventType: string; label: string; phase: string };

export function BakeDetail({
  bake,
  trackedBakePhases = null,
  customEventTypes = [],
  userTimezone,
  aiEnabled = true,
}: {
  bake: Bake;
  trackedBakePhases?: string[] | null;
  customEventTypes?: CustomEventType[];
  userTimezone: string;
  aiEnabled?: boolean;
}) {
  const router = useRouter();
  const tz = userTimezone;
  const [milestoneType, setMilestoneType] = useState<typeof MILESTONE_TYPES[number]>("fold");
  const [milestoneAt, setMilestoneAt] = useState(() => getNowForDateTimeLocalInput(tz));
  async function addMilestone(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/bakes/${bake.id}/milestones`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ milestoneType, occurredAt: dateTimeLocalStringToISO(milestoneAt, tz) }),
    });
    if (res.ok) {
      router.refresh();
      setMilestoneAt(getNowForDateTimeLocalInput(tz));
    }
  }

  async function deleteMilestone(mid: string) {
    if (!confirm("Delete this milestone?")) return;
    await fetch(`/api/bakes/${bake.id}/milestones/${mid}`, { method: "DELETE" });
    router.refresh();
  }

  const recipeSteps = bake.recipe?.steps ?? [];
  const recipeNotes = bake.recipe?.recipeNotes ?? [];
  const ingredients = bake.recipe?.ingredients ?? [];
  const hasScheduledSteps = recipeSteps.some((s) => s.estimatedMinutesFromStart != null);
  const showActiveTimeline = hasScheduledSteps;

  return (
    <div className="mt-6 space-y-8">
      <div>
        <p className="text-stone-600">
          Started {formatInUserTz(bake.startedAt, tz)}
          {bake.endedAt && ` • Ended ${formatInUserTz(bake.endedAt, tz)}`}
        </p>
        {bake.doughDevice?.name && <p className="text-sm text-stone-500">Dough device: {bake.doughDevice.name}</p>}
        {ingredients.length > 0 && (
          <details className="mt-3 rounded-lg border border-stone-200 bg-stone-50/50">
            <summary className="cursor-pointer px-4 py-3 font-medium text-stone-700">
              Ingredients ({ingredients.length})
            </summary>
            <ul className="border-t border-stone-200 px-4 py-3 space-y-2 text-sm text-stone-600">
              {ingredients.map((i) => (
                <li key={i.id} className="flex flex-wrap gap-x-2 gap-y-0.5">
                  <span className="font-medium text-stone-700">{i.name}</span>
                  {(i.amountG != null || i.bakerPct != null || i.notes) && (
                    <span className="text-stone-500">
                      — {[i.amountG != null && `${i.amountG}g`, i.bakerPct != null && `(${i.bakerPct}%)`, i.notes].filter(Boolean).join(" ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {bake.notes && <p className="mt-2 text-stone-600">{bake.notes}</p>}
      </div>

      {showActiveTimeline ? (
        <>
          <ActiveBakeTimeline
            bakeId={bake.id}
            startedAt={bake.startedAt}
            endedAt={bake.endedAt}
            recipe={{ steps: recipeSteps, recipeNotes, ingredients: bake.recipe?.ingredients ?? [] }}
            events={bake.events}
            trackedPhases={trackedBakePhases}
            customEventTypes={customEventTypes}
            starterCycleId={bake.starterCycle?.id ?? null}
          />
          <details className="rounded-lg border border-stone-200 bg-stone-50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stone-600 hover:text-stone-800">
              All events (edit times, delete)
            </summary>
            <div className="border-t border-stone-200 px-4 pb-4 pt-2">
              <BakeTimeline bakeId={bake.id} events={bake.events} customEventTypes={customEventTypes} />
            </div>
          </details>
        </>
      ) : (
        <BakeTimeline bakeId={bake.id} events={bake.events} customEventTypes={customEventTypes} />
      )}

      {aiEnabled && <VoiceLogWidget bakeId={bake.id} />}

      <div>
        <h2 className="font-medium text-stone-800">Legacy milestones</h2>
        <p className="text-sm text-stone-500">Use the Process timeline above for new entries.</p>
        <ul className="mt-2 space-y-1">
          {bake.milestones.map((m) => (
            <li key={m.id} className="flex items-center justify-between rounded border border-stone-200 bg-white px-3 py-2">
              <span>
                <span className="font-medium">{m.milestoneType}</span> — {formatInUserTz(m.occurredAt, tz)}
                {m.notes && ` — ${m.notes}`}
              </span>
              <button type="button" onClick={() => deleteMilestone(m.id)} className="text-red-600 hover:underline">Delete</button>
            </li>
          ))}
        </ul>
        <form onSubmit={addMilestone} className="mt-3 flex flex-wrap items-end gap-2">
          <select value={milestoneType} onChange={(e) => setMilestoneType(e.target.value as typeof MILESTONE_TYPES[number])} className="rounded border border-stone-300 px-3 py-2">
            {MILESTONE_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
          <input type="datetime-local" value={milestoneAt} onChange={(e) => setMilestoneAt(e.target.value)} className="rounded border border-stone-300 px-3 py-2" />
          <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900">Add</button>
        </form>
      </div>

      <div>
        <h2 className="font-medium text-stone-800">Outcome</h2>
        <p className="text-sm text-stone-500">Log how this bake turned out. Sliders 1–5, quick toggles, notes. Kept under 1 minute.</p>
        {bake.outcomes.length > 0 && (
          <ul className="mt-2 space-y-1">
            {bake.outcomes.map((o) => (
              <li key={o.id} className="rounded border border-stone-200 bg-white px-3 py-2 text-sm">
                {o.overallRating != null && <span>Overall {o.overallRating}/5</span>}
                {(o.tooSour || o.underproofed || o.overproofed || o.dense || o.gummy) && (
                  <span className="ml-2 text-stone-500">
                    [{[
                      o.tooSour && "too sour",
                      o.underproofed && "underproofed",
                      o.overproofed && "overproofed",
                      o.dense && "dense",
                      o.gummy && "gummy",
                    ]
                      .filter(Boolean)
                      .join(", ")}]
                  </span>
                )}
                {o.freeformNotes && <span className="ml-2">— {o.freeformNotes}</span>}
              </li>
            ))}
          </ul>
        )}
        <div className="mt-3 rounded-lg border border-stone-200 bg-stone-50/50 p-4">
          <OutcomeLogForm bakeId={bake.id} existingOutcome={bake.outcomes[0] ?? null} />
        </div>
      </div>

      <div>
        <RecommendationsBlock bakeId={bake.id} userTimezone={userTimezone} />
      </div>
    </div>
  );
}
