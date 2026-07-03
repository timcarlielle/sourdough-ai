"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DeviceBaseline({
  deviceId,
  baselineDistanceMm,
}: {
  deviceId: string;
  baselineDistanceMm: number | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSetFromLatest() {
    setError("");
    setLoading(true);
    try {
      const res = await fetch(`/api/devices/${deviceId}/set-baseline`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "Failed to set baseline.");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50/50 p-4">
      <h2 className="font-medium text-stone-800">Baseline (empty jar)</h2>
      <p className="mt-1 text-sm text-stone-600">
        Distance from sensor to top of jar when the jar is empty. New readings are converted to starter height as baseline minus raw distance.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {baselineDistanceMm != null ? (
          <span className="text-sm text-stone-700">
            Current baseline: <strong>{(baselineDistanceMm / 10).toFixed(2)} cm</strong> ({baselineDistanceMm} mm)
          </span>
        ) : (
          <span className="text-sm text-stone-500">No baseline set.</span>
        )}
        <button
          type="button"
          onClick={handleSetFromLatest}
          disabled={loading}
          className="rounded bg-amber-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
        >
          {loading ? "Setting…" : "Set from latest reading"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
