"use client";

import { useState } from "react";

export function CreateSiriTokenButton() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ token: string; name: string; message: string } | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleCreate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch("/api/voice-tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Siri" }),
      });
      if (!res.ok) throw new Error("Failed to create token");
      const data = await res.json();
      setResult(data);
    } catch {
      setResult({ token: "", name: "Siri", message: "Something went wrong. Try again." });
    } finally {
      setLoading(false);
    }
  }

  function handleCopy() {
    if (!result?.token) return;
    navigator.clipboard.writeText(result.token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function handleClose() {
    setResult(null);
  }

  return (
    <div className="mt-6 rounded-lg border border-stone-200 bg-stone-50/50 p-4">
      <h2 className="text-sm font-medium text-stone-700">Siri / voice logging</h2>
      <p className="mt-1 text-sm text-stone-500">
        Create a token to use with Siri Shortcuts or the ingest API (POST /ingest/voice). The token is shown only once.
      </p>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={handleCreate}
          disabled={loading}
          className="rounded border border-amber-700 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
        >
          {loading ? "Creating…" : "Create Siri token"}
        </button>
      </div>

      {result && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50/80 p-3">
          {result.token ? (
            <>
              <p className="text-xs font-medium text-amber-900">Your token (store it securely — it won’t be shown again):</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-white px-2 py-1.5 text-sm text-stone-800">
                  {result.token}
                </code>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="shrink-0 rounded border border-amber-700 px-2 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
              <p className="mt-2 text-xs text-stone-600">{result.message}</p>
            </>
          ) : (
            <p className="text-sm text-red-700">{result.message}</p>
          )}
          <button
            type="button"
            onClick={handleClose}
            className="mt-2 text-xs text-stone-500 underline hover:text-stone-700"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
