"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/timezone";

type Device = {
  id: string;
  name: string;
  deviceType: string;
  isActive: boolean;
  lastSeenAt: string | null;
};

export function DeviceEditForm({ device, userTimezone }: { device: Device; userTimezone: string }) {
  const [name, setName] = useState(device.name);
  const [isActive, setIsActive] = useState(device.isActive);
  const [error, setError] = useState("");
  const [rotatedToken, setRotatedToken] = useState<string | null>(null);
  const router = useRouter();

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/devices/${device.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, isActive }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Update failed.");
      return;
    }
    router.refresh();
  }

  async function handleRotateToken() {
    if (!confirm("Generate a new token? The old token will stop working.")) return;
    setError("");
    const res = await fetch(`/api/devices/${device.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rotateToken: true }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error ?? "Rotate failed.");
      return;
    }
    setRotatedToken(data.token);
    router.refresh();
  }

  return (
    <div className="mt-6 space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {rotatedToken && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">New token (copy now):</p>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-3 text-sm">{rotatedToken}</pre>
        </div>
      )}
      <form onSubmit={handleSave} className="max-w-md space-y-4">
        <div>
          <label htmlFor="name" className="block text-sm font-medium text-stone-700">Name</label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            id="isActive"
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
            className="rounded border-stone-300"
          />
          <label htmlFor="isActive" className="text-sm text-stone-700">Active (accept telemetry)</label>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900">
            Save
          </button>
          <button
            type="button"
            onClick={handleRotateToken}
            className="rounded border border-stone-300 px-4 py-2 text-stone-700 hover:bg-stone-50"
          >
            Rotate token
          </button>
        </div>
      </form>
      {device.lastSeenAt && (
        <p className="text-sm text-stone-500">Last seen: {formatDateTime(device.lastSeenAt, userTimezone)}</p>
      )}
    </div>
  );
}
