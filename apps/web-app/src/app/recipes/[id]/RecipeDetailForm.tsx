"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Recipe = {
  id: string;
  title: string;
  description: string | null;
  url: string | null;
  isDefault: boolean;
  ingredients: { id: string; name: string; amountG: number | null; bakerPct: number | null; notes: string | null; sortOrder: number }[];
  steps: {
    id: string;
    section: string;
    stepText: string;
    sortOrder: number;
    estimatedMinutesFromStart?: number | null;
    eventType?: string | null;
    eventPhase?: string | null;
  }[];
  recipeNotes: { id: string; category: string; noteText: string; sortOrder: number }[];
};

export function RecipeDetailForm({ recipe }: { recipe: Recipe }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(recipe.title);
  const [description, setDescription] = useState(recipe.description ?? "");
  const [error, setError] = useState("");

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch(`/api/recipes/${recipe.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        description: description || null,
        ingredients: recipe.ingredients.map((i) => ({ name: i.name, amountG: i.amountG, bakerPct: i.bakerPct, notes: i.notes, sortOrder: i.sortOrder })),
        steps: recipe.steps.map((s) => ({ section: s.section, stepText: s.stepText, sortOrder: s.sortOrder })),
        recipeNotes: recipe.recipeNotes.map((n) => ({ category: n.category, noteText: n.noteText, sortOrder: n.sortOrder })),
      }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error?.message ?? "Update failed.");
      return;
    }
    setEditing(false);
    router.refresh();
  }

  async function handleDelete() {
    if (!confirm("Delete this recipe?")) return;
    const res = await fetch(`/api/recipes/${recipe.id}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/recipes");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Cannot delete default recipe.");
    }
  }

  return (
    <div className="mt-6 space-y-6">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {editing ? (
        <form onSubmit={handleSave} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-stone-700">Title</label>
            <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required className="mt-1 w-full max-w-md rounded border border-stone-300 px-3 py-2" />
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700">Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full max-w-md rounded border border-stone-300 px-3 py-2" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded bg-amber-800 px-4 py-2 text-white hover:bg-amber-900">Save</button>
            <button type="button" onClick={() => setEditing(false)} className="rounded border border-stone-300 px-4 py-2">Cancel</button>
          </div>
        </form>
      ) : (
        <>
          {recipe.url && (
            <p>
              <a href={recipe.url} target="_blank" rel="noopener noreferrer" className="text-amber-800 hover:underline">
                View original recipe →
              </a>
            </p>
          )}
          {recipe.description && <p className="text-stone-600">{recipe.description}</p>}
          <div>
            <h2 className="font-medium text-stone-800">Ingredients</h2>
            <ul className="mt-2 list-disc pl-5 text-stone-700">
              {recipe.ingredients.map((i) => (
                <li key={i.id}>
                  {i.name}
                  {i.amountG != null && ` — ${i.amountG}g`}
                  {i.bakerPct != null && ` (${i.bakerPct}%)`}
                  {i.notes && ` — ${i.notes}`}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="font-medium text-stone-800">Steps</h2>
            <ul className="mt-2 space-y-1 text-stone-700">
              {recipe.steps.map((s) => (
                <li key={s.id}><span className="text-stone-500">[{s.section}]</span> {s.stepText}</li>
              ))}
            </ul>
          </div>
          <details className="rounded-lg border border-stone-200 bg-stone-50/50">
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-stone-600 hover:text-stone-800">
              Bake timeline (debug)
            </summary>
            <p className="border-t border-stone-200 px-4 pt-2 pb-1 text-xs text-stone-500">
              Parsed timeline data used when starting a bake. Order should match recipe order; times must not decrease.
            </p>
            <div className="border-t border-stone-200 px-4 pb-4 overflow-x-auto">
              <table className="mt-2 w-full min-w-[520px] text-sm">
                <thead>
                  <tr className="text-left text-stone-500 border-b border-stone-200">
                    <th className="py-1.5 pr-2">#</th>
                    <th className="py-1.5 pr-2">Section</th>
                    <th className="py-1.5 pr-2">eventType</th>
                    <th className="py-1.5 pr-2">eventPhase</th>
                    <th className="py-1.5 pr-2">Min from start</th>
                    <th className="py-1.5">Step (preview)</th>
                  </tr>
                </thead>
                <tbody>
                  {recipe.steps.map((s) => (
                    <tr key={s.id} className="border-b border-stone-100">
                      <td className="py-1.5 pr-2 tabular-nums">{s.sortOrder}</td>
                      <td className="py-1.5 pr-2">{s.section}</td>
                      <td className="py-1.5 pr-2 font-mono text-xs">{s.eventType ?? "—"}</td>
                      <td className="py-1.5 pr-2 font-mono text-xs">{s.eventPhase ?? "—"}</td>
                      <td className="py-1.5 pr-2 tabular-nums">{s.estimatedMinutesFromStart ?? "—"}</td>
                      <td className="py-1.5 text-stone-600 truncate max-w-[200px]" title={s.stepText}>
                        {s.stepText.slice(0, 50)}{s.stepText.length > 50 ? "…" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          {recipe.recipeNotes.length > 0 && (
            <div>
              <h2 className="font-medium text-stone-800">Notes</h2>
              <ul className="mt-2 space-y-1 text-stone-700">
                {recipe.recipeNotes.map((n) => (
                  <li key={n.id}><span className="text-stone-500">[{n.category}]</span> {n.noteText}</li>
                ))}
              </ul>
            </div>
          )}
          {!recipe.isDefault && (
            <div className="flex gap-2">
              <button onClick={() => setEditing(true)} className="rounded border border-stone-300 px-4 py-2 hover:bg-stone-50">Edit</button>
              <button onClick={handleDelete} className="rounded border border-red-300 text-red-700 px-4 py-2 hover:bg-red-50">Delete</button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
