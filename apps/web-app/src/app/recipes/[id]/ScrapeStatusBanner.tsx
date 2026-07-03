"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const POLL_INTERVAL_MS = 2500;

export function ScrapeStatusBanner({
  recipeId,
  initialScrapePending,
}: {
  recipeId: string;
  initialScrapePending: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(initialScrapePending);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!pending) return;

    async function check() {
      try {
        const res = await fetch(`/api/recipes/${recipeId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.scrapePending === false) {
          setPending(false);
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          router.refresh();
        }
      } catch {
        // ignore; will retry
      }
    }

    intervalRef.current = setInterval(check, POLL_INTERVAL_MS);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [recipeId, pending, router]);

  if (!pending) return null;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-amber-900">
      <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-amber-600 border-t-transparent" aria-hidden />
      <span>Extracting recipe from link… This page will update when ready.</span>
    </div>
  );
}
