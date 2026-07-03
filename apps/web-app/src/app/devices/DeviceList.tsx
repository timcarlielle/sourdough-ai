"use client";

import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/timezone";

type Device = {
  id: string;
  name: string;
  deviceType: string;
  isActive: boolean;
  lastSeenAt: string | null;
  createdAt: string;
};

export function DeviceList({ devices, userTimezone }: { devices: Device[]; userTimezone: string }) {
  const router = useRouter();

  if (devices.length === 0) {
    return (
      <p className="mt-4 text-stone-600">
        No devices yet. Add one to get a token for telemetry ingestion.
      </p>
    );
  }

  return (
    <ul className="mt-4 space-y-3">
      {devices.map((d) => (
        <li
          key={d.id}
          className="flex items-center justify-between rounded-lg border border-stone-200 bg-white p-4"
        >
          <div>
            <p className="font-medium text-stone-900">{d.name}</p>
            <p className="text-sm text-stone-500">
              {d.deviceType.replace("_", " ")} • {d.isActive ? "Active" : "Inactive"}
              {d.lastSeenAt && ` • Last seen ${formatDateTime(d.lastSeenAt, userTimezone)}`}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => router.push(`/devices/${d.id}`)}
              className="rounded border border-stone-300 px-3 py-1.5 text-sm hover:bg-stone-50"
            >
              Edit
            </button>
          </div>
        </li>
      ))}
    </ul>
  );
}
