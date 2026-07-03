"use client";

import { useCallback, useEffect, useState } from "react";

type TokenRow = {
  id: string;
  name: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

export function ApiTokensSettings() {
  const [tokens, setTokens] = useState<TokenRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch("/api/account/tokens")
      .then((r) => r.json())
      .then((d) => setTokens(d.tokens ?? []))
      .catch(() => setError("Failed to load tokens"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function createToken(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    setNewToken(null);
    try {
      const res = await fetch("/api/account/tokens", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      });
      if (!res.ok) throw new Error();
      const d = await res.json();
      setNewToken(d.token);
      setName("");
      load();
    } catch {
      setError("Failed to create token");
    } finally {
      setCreating(false);
    }
  }

  async function revoke(id: string) {
    if (!confirm("Revoke this token? Clients using it will be signed out.")) return;
    await fetch(`/api/account/tokens/${id}`, { method: "DELETE" });
    load();
  }

  return (
    <section className="rounded-lg border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-medium text-stone-800">API access tokens</h2>
      <p className="mt-1 text-sm text-stone-600">
        Tokens let the mobile app and scripts access your data. Treat them like passwords —
        each token is shown only once.
      </p>

      {newToken && (
        <div className="mt-4 rounded border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-900">Copy your new token now — it won&apos;t be shown again:</p>
          <code className="mt-2 block break-all rounded bg-white p-2 text-xs text-stone-800">{newToken}</code>
        </div>
      )}
      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      <form onSubmit={createToken} className="mt-4 flex flex-wrap gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Token name (e.g. My iPhone)"
          className="min-w-0 flex-1 rounded border border-stone-300 px-3 py-2 text-sm text-stone-900"
          maxLength={100}
        />
        <button
          type="submit"
          disabled={creating || !name.trim()}
          className="rounded bg-amber-800 px-4 py-2 text-sm text-white hover:bg-amber-900 disabled:opacity-50"
        >
          {creating ? "Creating…" : "Create token"}
        </button>
      </form>

      <div className="mt-4 divide-y divide-stone-100">
        {loading && <p className="py-2 text-sm text-stone-500">Loading…</p>}
        {!loading && tokens.length === 0 && (
          <p className="py-2 text-sm text-stone-500">No tokens yet.</p>
        )}
        {tokens.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div className="min-w-0">
              <p className="text-sm font-medium text-stone-800">
                {t.name}
                {t.revokedAt && <span className="ml-2 rounded bg-stone-100 px-2 py-0.5 text-xs text-stone-500">revoked</span>}
              </p>
              <p className="text-xs text-stone-500">
                Created {new Date(t.createdAt).toLocaleDateString()}
                {t.lastUsedAt ? ` · last used ${new Date(t.lastUsedAt).toLocaleString()}` : " · never used"}
              </p>
            </div>
            {!t.revokedAt && (
              <button
                onClick={() => revoke(t.id)}
                className="rounded border border-red-300 px-3 py-1 text-sm text-red-700 hover:bg-red-50"
              >
                Revoke
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
