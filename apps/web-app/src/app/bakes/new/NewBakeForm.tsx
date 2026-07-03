"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dateTimeLocalStringToISO, formatInUserTz, getNowForDateTimeLocalInput } from "@/lib/timezone";
import { useUserTimezone } from "@/lib/use-user-timezone";

type Recipe = { id: string; title: string };
type Cycle = { id: string; startedAt: Date };
type Device = { id: string; name: string };

export function NewBakeForm({
  recipes,
  cycles,
  doughDevices,
}: {
  recipes: Recipe[];
  cycles: Cycle[];
  doughDevices: Device[];
}) {
  const router = useRouter();
  const tz = useUserTimezone();
  const [recipeId, setRecipeId] = useState(recipes[0]?.id ?? "");
  const [starterCycleId, setStarterCycleId] = useState("");
  const [doughDeviceId, setDoughDeviceId] = useState("");
  const [startedAt, setStartedAt] = useState(() => getNowForDateTimeLocalInput(tz));
  const [doughBatchName, setDoughBatchName] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/bakes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipeId,
        starterCycleId: starterCycleId || null,
        doughDeviceId: doughDeviceId || null,
        startedAt: dateTimeLocalStringToISO(startedAt, tz),
        doughBatchName: doughBatchName || null,
        notes: notes || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error?.message ?? "Failed to create.");
      return;
    }
    const data = await res.json();
    router.push(`/bakes/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label className="block text-sm font-medium text-stone-700">Recipe</label>
        <select value={recipeId} onChange={(e) => setRecipeId(e.target.value)} required className="mt-1 w-full rounded border border-stone-300 px-3 py-2">
          {recipes.map((r) => (
            <option key={r.id} value={r.id}>{r.title}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700">Starter cycle (optional)</label>
        <select value={starterCycleId} onChange={(e) => setStarterCycleId(e.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2">
          <option value="">—</option>
          {cycles.map((c) => (
            <option key={c.id} value={c.id}>{formatInUserTz(c.startedAt, tz)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700">Dough device (optional)</label>
        <select value={doughDeviceId} onChange={(e) => setDoughDeviceId(e.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2">
          <option value="">—</option>
          {doughDevices.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700">Started at</label>
        <input type="datetime-local" value={startedAt} onChange={(e) => setStartedAt(e.target.value)} required className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700">Batch name (optional)</label>
        <input type="text" value={doughBatchName} onChange={(e) => setDoughBatchName(e.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
      </div>
      <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900">Create bake</button>
    </form>
  );
}
