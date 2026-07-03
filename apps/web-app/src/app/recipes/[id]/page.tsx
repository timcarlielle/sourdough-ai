import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import Link from "next/link";
import { RecipeDetailForm } from "./RecipeDetailForm";
import { ScrapeStatusBanner } from "./ScrapeStatusBanner";

export default async function RecipeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const id = (await params).id;
  const recipe = await prisma.recipe.findFirst({
    where: { id, userId: session.user.id },
    include: {
      ingredients: { orderBy: { sortOrder: "asc" } },
      steps: { orderBy: { sortOrder: "asc" } },
      recipeNotes: { orderBy: { sortOrder: "asc" } },
    },
  });
  if (!recipe) notFound();
  return (
    <AppLayout>
      <div className="flex items-center gap-4">
        <Link href="/recipes" className="text-stone-600 hover:text-stone-900">← Recipes</Link>
        <h1 className="text-2xl font-semibold text-stone-800">{recipe.title}</h1>
        {recipe.isDefault && <span className="rounded bg-amber-100 px-2 py-0.5 text-sm text-amber-800">Default</span>}
      </div>
      {recipe.scrapePending && (
        <ScrapeStatusBanner recipeId={recipe.id} initialScrapePending={recipe.scrapePending} />
      )}
      <RecipeDetailForm recipe={recipe} />
    </AppLayout>
  );
}
