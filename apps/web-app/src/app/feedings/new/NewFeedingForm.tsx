"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { dateTimeLocalStringToISO, getNowForDateTimeLocalInput } from "@/lib/timezone";
import { useUserTimezone } from "@/lib/use-user-timezone";

type Device = { id: string; name: string };

export function NewFeedingForm({ devices }: { devices: Device[] }) {
  const router = useRouter();
  const tz = useUserTimezone();
  const [deviceId, setDeviceId] = useState("");
  const [fedAt, setFedAt] = useState(() => getNowForDateTimeLocalInput(tz));
  const [starterAmountG, setStarterAmountG] = useState(25);
  const [flourAmountG, setFlourAmountG] = useState(100);
  const [flourNotes, setFlourNotes] = useState("");
  const [waterAmountG, setWaterAmountG] = useState(100);
  const [waterTempC, setWaterTempC] = useState("");
  const [saltG, setSaltG] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/feedings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        deviceId: deviceId || null,
        fedAt: dateTimeLocalStringToISO(fedAt, tz),
        starterAmountG: Number(starterAmountG),
        flourAmountG: Number(flourAmountG),
        flourNotes: flourNotes || null,
        waterAmountG: Number(waterAmountG),
        waterTempC: waterTempC ? Number(waterTempC) : null,
        saltG: saltG ? Number(saltG) : null,
        notes: notes || null,
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error?.message ?? "Failed to save.");
      return;
    }
    const data = await res.json();
    router.push(`/feedings/${data.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-4">
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div>
        <label className="block text-sm font-medium text-stone-700">Fed at</label>
        <input
          type="datetime-local"
          value={fedAt}
          onChange={(e) => setFedAt(e.target.value)}
          required
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700">Starter device (optional)</label>
        <select
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
        >
          <option value="">—</option>
          {devices.map((d) => (
            <option key={d.id} value={d.id}>{d.name}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700">Starter (g)</label>
          <input type="number" step="0.1" min="0" value={starterAmountG} onChange={(e) => setStarterAmountG(Number(e.target.value))} required className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Flour (g)</label>
          <input type="number" step="0.1" min="0" value={flourAmountG} onChange={(e) => setFlourAmountG(Number(e.target.value))} required className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Water (g)</label>
          <input type="number" step="0.1" min="0" value={waterAmountG} onChange={(e) => setWaterAmountG(Number(e.target.value))} required className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700">Flour notes</label>
        <input type="text" value={flourNotes} onChange={(e) => setFlourNotes(e.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" placeholder="e.g. bread flour" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700">Water temp (°C)</label>
          <input type="number" step="0.1" value={waterTempC} onChange={(e) => setWaterTempC(e.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Salt (g)</label>
          <input type="number" step="0.1" min="0" value={saltG} onChange={(e) => setSaltG(e.target.value)} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </div>
      </div>
      <div>
        <label className="block text-sm font-medium text-stone-700">Notes</label>
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
      </div>
      <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900">Save</button>
    </form>
  );
}
