import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { AppLayout } from "@/components/AppLayout";
import { PlanningClient } from "./PlanningClient";
import { prisma } from "@/lib/prisma";

export default async function PlanningPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");

  const [recipes, lastCycle] = await Promise.all([
    prisma.recipe.findMany({
      where: { userId: session.user.id! },
      orderBy: { title: "asc" },
      select: { id: true, title: true },
    }),
    prisma.starterCycle.findFirst({
      where: { userId: session.user.id! },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    }),
  ]);

  return (
    <AppLayout>
      <div className="space-y-8">
        <h1 className="text-2xl font-semibold text-stone-800">Bake planning</h1>
        <PlanningClient
          recipes={recipes}
          lastCycleStartedAt={lastCycle?.startedAt?.toISOString() ?? null}
        />
      </div>
    </AppLayout>
  );
}
