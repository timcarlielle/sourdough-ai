"use client";

import { useRouter } from "next/navigation";

export function DeleteBakeButton({ bakeId }: { bakeId: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("Delete this bake? All events, milestones, and outcomes will be removed.")) return;
    const res = await fetch(`/api/bakes/${bakeId}`, { method: "DELETE" });
    if (res.ok) {
      router.push("/bakes");
      router.refresh();
    } else {
      const data = await res.json().catch(() => ({}));
      alert(data.error ?? "Delete failed.");
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="rounded border border-red-300 bg-white px-4 py-2 text-sm text-red-700 hover:bg-red-50"
    >
      Delete bake
    </button>
  );
}
