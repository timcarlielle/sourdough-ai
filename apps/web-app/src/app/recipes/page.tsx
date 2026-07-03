import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import Link from "next/link";
import { RecipeSearch } from "./RecipeSearch";

export default async function RecipesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const { q } = await searchParams;
  const recipes = await prisma.recipe.findMany({
    where: {
      userId: session.user.id,
      ...(q && { title: { contains: q, mode: "insensitive" } }),
    },
    orderBy: [{ isDefault: "desc" }, { updatedAt: "desc" }],
  });
  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-800">Recipes</h1>
        <Link href="/recipes/new" className="rounded bg-amber-800 px-4 py-2 text-sm text-white hover:bg-amber-900">New recipe</Link>
      </div>
      <RecipeSearch />
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        {recipes.map((r) => (
          <div key={r.id} className="rounded-lg border border-stone-200 bg-white p-4 hover:bg-stone-50">
            <Link href={`/recipes/${r.id}`} className="block">
              <p className="font-medium text-stone-900">{r.title}</p>
              {r.isDefault && <span className="text-xs text-amber-700">Default</span>}
              {r.description && <p className="mt-1 text-sm text-stone-500 line-clamp-2">{r.description}</p>}
            </Link>
            {r.url && (
              <a href={r.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs text-amber-800 hover:underline">
                View original →
              </a>
            )}
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
