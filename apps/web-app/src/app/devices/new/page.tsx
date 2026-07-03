"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";

export default function NewDevicePage() {
  const [name, setName] = useState("");
  const [deviceType, setDeviceType] = useState<"starter_monitor" | "dough_monitor">("starter_monitor");
  const [error, setError] = useState("");
  const [created, setCreated] = useState<{ id: string; token: string } | null>(null);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/devices", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, deviceType }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setError(data.error?.message ?? data.error ?? "Failed to create device.");
      return;
    }
    setCreated({ id: data.id, token: data.token });
  }

  return (
    <AppLayout>
      <div className="flex items-center gap-4">
        <Link href="/devices" className="text-stone-600 hover:text-stone-900">← Devices</Link>
        <h1 className="text-2xl font-semibold text-stone-800">Add device</h1>
      </div>
      {created ? (
        <div className="mt-6 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="font-medium text-amber-900">Device created. Copy the token now — it won&apos;t be shown again.</p>
          <pre className="mt-2 overflow-x-auto rounded bg-white p-3 text-sm text-stone-800">{created.token}</pre>
          <Link href="/devices" className="mt-4 inline-block text-amber-800 hover:underline">Back to devices</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-4">
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-stone-700">Name</label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Starter Jar A"
              required
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            />
          </div>
          <div>
            <label htmlFor="deviceType" className="block text-sm font-medium text-stone-700">Type</label>
            <select
              id="deviceType"
              value={deviceType}
              onChange={(e) => setDeviceType(e.target.value as "starter_monitor" | "dough_monitor")}
              className="mt-1 w-full rounded border border-stone-300 px-3 py-2"
            >
              <option value="starter_monitor">Starter monitor</option>
              <option value="dough_monitor">Dough monitor</option>
            </select>
          </div>
          <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900">
            Create device
          </button>
        </form>
      )}
    </AppLayout>
  );
}
