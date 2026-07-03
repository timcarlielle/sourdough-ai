"use client";

import { useEffect, useState } from "react";
import { formatDateTime } from "@/lib/timezone";

type Reading = {
  id: string;
  readingType: string;
  recordedAt: string;
  distanceMm: number | null;
  heightMm: number | null;
  ambientTempC: number | null;
  ambientHumidityPct: number | null;
  doughTempC: number | null;
};

export function DeviceReadings({ deviceId, userTimezone }: { deviceId: string; userTimezone: string }) {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/devices/${deviceId}/readings?limit=50`)
      .then((r) => r.json())
      .then((d) => { setReadings(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [deviceId]);

  if (loading) return <p className="mt-6 text-stone-500">Loading readings…</p>;
  if (readings.length === 0) return <p className="mt-6 text-stone-500">No telemetry readings yet.</p>;

  return (
    <div className="mt-8">
      <h2 className="font-medium text-stone-800">Recent readings</h2>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-stone-500">
              <th className="py-2 pr-4">Time</th>
              <th className="py-2 pr-4">Type</th>
              <th className="py-2 pr-4">Raw (mm)</th>
              <th className="py-2 pr-4">Height (mm)</th>
              <th className="py-2 pr-4">Ambient °C</th>
              <th className="py-2 pr-4">Humidity %</th>
              <th className="py-2">Dough °C</th>
            </tr>
          </thead>
          <tbody>
            {readings.map((r) => (
              <tr key={r.id} className="border-b border-stone-100">
                <td className="py-2 pr-4">{formatDateTime(r.recordedAt, userTimezone)}</td>
                <td className="py-2 pr-4">{r.readingType}</td>
                <td className="py-2 pr-4">{r.distanceMm != null ? r.distanceMm : "—"}</td>
                <td className="py-2 pr-4">{r.heightMm != null ? r.heightMm : "—"}</td>
                <td className="py-2 pr-4">{r.ambientTempC != null ? r.ambientTempC : "—"}</td>
                <td className="py-2 pr-4">{r.ambientHumidityPct != null ? r.ambientHumidityPct : "—"}</td>
                <td className="py-2">{r.doughTempC != null ? r.doughTempC : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
