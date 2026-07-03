"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RerunParseButton({
  voiceLogId,
  status,
}: {
  voiceLogId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleRerun() {
    setLoading(true);
    try {
      const res = await fetch(`/api/voice-logs/${voiceLogId}/rerun`, { method: "POST" });
      if (res.ok) {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleRerun}
      disabled={loading}
      className="rounded border border-stone-300 bg-white px-3 py-1.5 text-sm text-stone-700 hover:bg-stone-50 disabled:opacity-50"
    >
      {loading ? "Re-running…" : "Re-run parse"}
    </button>
  );
}
