"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AppLayout } from "@/components/AppLayout";

export default function NewRecipePage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [fetchingPreview, setFetchingPreview] = useState(false);
  const [error, setError] = useState("");
  const [aiEnabled, setAiEnabled] = useState(true);

  useEffect(() => {
    fetch("/api/meta")
      .then((r) => r.json())
      .then((d) => setAiEnabled(Boolean(d?.features?.ai)))
      .catch(() => {});
  }, []);

  async function fetchPreview() {
    const u = url.trim();
    if (!u || !u.startsWith("http")) return;
    setFetchingPreview(true);
    setError("");
    try {
      const res = await fetch(`/api/recipes/scrape-preview?url=${encodeURIComponent(u)}`);
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.title || data.description)) {
        if (data.title) setTitle(data.title);
        if (data.description) setDescription(data.description);
      }
    } finally {
      setFetchingPreview(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const finalUrl = url.trim() && url.startsWith("http") ? url.trim() : undefined;
    const res = await fetch("/api/recipes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: title || "Untitled Recipe",
        description: description || null,
        url: finalUrl ?? null,
        ingredients: [],
        steps: [],
        recipeNotes: [],
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error?.message ?? "Failed to create.");
      return;
    }
    const data = await res.json();
    router.push(`/recipes/${data.id}`);
    router.refresh();
  }

  return (
    <AppLayout>
      <div className="flex items-center gap-4">
        <Link href="/recipes" className="text-stone-600 hover:text-stone-900">← Recipes</Link>
        <h1 className="text-2xl font-semibold text-stone-800">New recipe</h1>
      </div>
      <form onSubmit={handleSubmit} className="mt-6 max-w-md space-y-4">
        {error && <p className="text-sm text-red-600">{error}</p>}
        {aiEnabled && (
        <div>
          <label className="block text-sm font-medium text-stone-700">Recipe URL (optional)</label>
          <p className="mt-0.5 text-xs text-stone-500">Paste a link to a recipe; we’ll fetch the title and description, then extract ingredients, steps, and notes in the background.</p>
          <div className="mt-2 flex gap-2">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onBlur={() => url.trim().startsWith("http") && fetchPreview()}
              placeholder="https://..."
              className="flex-1 rounded border border-stone-300 px-3 py-2"
            />
            <button
              type="button"
              onClick={fetchPreview}
              disabled={fetchingPreview || !url.trim().startsWith("http")}
              className="rounded border border-stone-300 bg-white px-4 py-2 text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {fetchingPreview ? "Fetching…" : "Fetch preview"}
            </button>
          </div>
        </div>
        )}
        <div>
          <label className="block text-sm font-medium text-stone-700">Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </div>
        <p className="text-sm text-stone-500">You can add or edit ingredients, steps, and notes after creating. If you added a URL, we’ll try to fill them from the link shortly.</p>
        <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900">Create</button>
      </form>
    </AppLayout>
  );
}
