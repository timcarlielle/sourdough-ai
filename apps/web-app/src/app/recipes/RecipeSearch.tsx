"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function RecipeSearch() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const q = searchParams.get("q") ?? "";

  const updateQuery = useCallback(
    (value: string) => {
      const next = new URLSearchParams(searchParams);
      if (value) next.set("q", value);
      else next.delete("q");
      router.push(`/recipes?${next.toString()}`);
    },
    [router, searchParams]
  );

  return (
    <div className="mt-4">
      <input
        type="search"
        placeholder="Search recipes..."
        value={q}
        onChange={(e) => updateQuery(e.target.value)}
        className="w-full max-w-sm rounded border border-stone-300 px-3 py-2"
      />
    </div>
  );
}
