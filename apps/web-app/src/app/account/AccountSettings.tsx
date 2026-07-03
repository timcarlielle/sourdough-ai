"use client";

import { useEffect, useState } from "react";

const COMMON_TIMEZONES = [
  "America/Edmonton",
  "America/Los_Angeles",
  "America/Denver",
  "America/Chicago",
  "America/New_York",
  "America/Toronto",
  "America/Vancouver",
  "America/St_Johns",
  "America/Halifax",
  "America/Winnipeg",
  "America/Regina",
  "America/Anchorage",
  "Pacific/Auckland",
  "Australia/Sydney",
  "Australia/Melbourne",
  "Australia/Perth",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Asia/Singapore",
  "Asia/Dubai",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Amsterdam",
  "Europe/Stockholm",
  "Europe/Helsinki",
  "Europe/Moscow",
  "UTC",
];

export function AccountSettings({
  email,
  initialTimezone,
}: {
  email: string | null | undefined;
  initialTimezone: string;
}) {
  const [timezone, setTimezone] = useState(initialTimezone);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<"saved" | "error" | null>(null);

  useEffect(() => {
    setTimezone(initialTimezone);
  }, [initialTimezone]);

  async function handleTimezoneChange(value: string) {
    setTimezone(value);
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ timezone: value }),
      });
      if (res.ok) {
        setMessage("saved");
      } else {
        setMessage("error");
      }
    } catch {
      setMessage("error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <p className="text-stone-600">Email</p>
        <p className="font-medium text-stone-900">{email ?? "—"}</p>
      </div>
      <div className="rounded-lg border border-stone-200 bg-white p-4">
        <label htmlFor="timezone" className="block text-sm font-medium text-stone-700">
          Timezone
        </label>
        <p className="mt-1 text-sm text-stone-500">
          All times in the app (feedings, bakes, dashboard) will show in this timezone.
        </p>
        <select
          id="timezone"
          value={timezone}
          onChange={(e) => handleTimezoneChange(e.target.value)}
          disabled={saving}
          className="mt-2 w-full max-w-md rounded border border-stone-300 px-3 py-2 text-stone-800 disabled:opacity-60"
        >
          {COMMON_TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>
              {tz.replace(/_/g, " ")}
            </option>
          ))}
        </select>
        {message === "saved" && <p className="mt-2 text-sm text-green-600">Saved.</p>}
        {message === "error" && <p className="mt-2 text-sm text-red-600">Failed to save.</p>}
      </div>
    </div>
  );
}
