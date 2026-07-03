import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { AnalyticsDebugClient } from "./AnalyticsDebugClient";
import { prisma } from "@/lib/prisma";

type PageProps = { searchParams: { cycleId?: string; modelId?: string } };

export default async function AnalyticsPage({ searchParams }: PageProps) {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const initialCycleId = searchParams.cycleId ?? null;
  const initialModelId = searchParams.modelId ?? null;

  const bakesWithOutcomes = await prisma.bake.findMany({
    where: { userId: session.user.id!, outcomes: { some: {} } },
    orderBy: { startedAt: "desc" },
    take: 50,
    include: {
      recipe: { select: { title: true } },
      outcomes: { take: 1 },
      _count: { select: { recipeAdjustmentSets: true } },
    },
  });

  const starterDebugEnabled = process.env.NEXT_PUBLIC_STARTER_DEBUG === "true" || process.env.NEXT_PUBLIC_STARTER_DEBUG === "1";

  return (
    <AppLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold text-stone-800">Analytics debug</h1>
        <p className="text-sm text-stone-600">
          View fermentation curves, derived metrics, rules triggered, and suggestions for bakes that have an outcome logged.
        </p>
        <AnalyticsDebugClient
          bakes={bakesWithOutcomes.map((b) => ({
            id: b.id,
            startedAt: b.startedAt.toISOString(),
            recipeTitle: b.recipe.title,
            hasAdjustments: b._count.recipeAdjustmentSets > 0,
          }))}
          initialCycleId={initialCycleId}
          initialModelId={initialModelId}
          starterDebugEnabled={starterDebugEnabled}
        />
      </div>
    </AppLayout>
  );
}
