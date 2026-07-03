"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { formatDateTime } from "@/lib/timezone";

type Suggestion = { type: string; old_value?: string; suggested?: string; reason?: string };
type Payload = { suggestions?: Suggestion[]; rulesTriggered?: string[] };

export function RecommendationsBlock({ bakeId, userTimezone }: { bakeId: string; userTimezone: string }) {
  const [sets, setSets] = useState<Array<{
    id: string;
    suggestions: unknown;
    suggestionFeedback: Record<string, string> | null;
    confidenceScore: number | null;
    createdAt: string;
  }> | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/bakes/${bakeId}/adjustment-sets`)
      .then((r) => r.json())
      .then(setSets)
      .catch(() => setSets([]))
      .finally(() => setLoading(false));
  }, [bakeId]);

  async function setFeedback(setId: string, index: number, action: "accepted" | "ignored") {
    const set = sets?.find((s) => s.id === setId);
    if (!set) return;
    const current = (set.suggestionFeedback as Record<string, string>) ?? {};
    const next = { ...current, [String(index)]: action };
    const res = await fetch(`/api/recipe-adjustment-sets/${setId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suggestionFeedback: next }),
    });
    if (res.ok) {
      const listRes = await fetch(`/api/bakes/${bakeId}/adjustment-sets`);
      const data = await listRes.json();
      setSets(data);
    }
  }

  if (loading) return <p className="text-sm text-stone-500">Loading recommendations…</p>;
  if (!sets?.length) return null;

  return (
    <div className="space-y-4">
      <h2 className="font-medium text-stone-800">Recommendations</h2>
      <p className="text-sm text-stone-500">
        From the analytics engine. Accept or ignore each suggestion.{" "}
        <Link href="/analytics" className="text-amber-700 hover:underline">View full debug</Link>
      </p>
      {sets.map((adj) => {
        const payload = adj.suggestions as Payload | null;
        const list = Array.isArray(payload?.suggestions) ? payload!.suggestions : (payload && "suggestions" in payload ? (payload as { suggestions: Suggestion[] }).suggestions : []);
        const feedback = (adj.suggestionFeedback as Record<string, string>) ?? {};
        if (list.length === 0) return null;
        return (
          <div key={adj.id} className="rounded-lg border border-stone-200 bg-stone-50/50 p-4">
            <p className="text-xs text-stone-500">Created {formatDateTime(adj.createdAt, userTimezone)}</p>
            <ul className="mt-2 space-y-2">
              {list.map((s, i) => (
                <li key={i} className="flex flex-wrap items-start justify-between gap-2 rounded border border-stone-100 bg-white p-3">
                  <div>
                    <span className="font-medium text-amber-800">{s.type}</span>
                    {s.old_value != null && <span className="text-stone-600"> — was {s.old_value}</span>}
                    {s.suggested != null && <span className="text-stone-700"> → {s.suggested}</span>}
                    {s.reason && <p className="mt-1 text-sm text-stone-500">{s.reason}</p>}
                  </div>
                  <div className="flex gap-2">
                    {feedback[String(i)] === "accepted" ? (
                      <span className="text-sm text-green-600">Accepted</span>
                    ) : feedback[String(i)] === "ignored" ? (
                      <span className="text-sm text-stone-400">Ignored</span>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => setFeedback(adj.id, i, "accepted")}
                          className="rounded bg-green-600 px-2 py-1 text-xs text-white hover:bg-green-700"
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          onClick={() => setFeedback(adj.id, i, "ignored")}
                          className="rounded border border-stone-300 bg-white px-2 py-1 text-xs text-stone-600 hover:bg-stone-50"
                        >
                          Ignore
                        </button>
                      </>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}
