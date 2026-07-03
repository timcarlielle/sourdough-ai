import type React from "react";
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import Link from "next/link";
import { APP_TIMEZONE } from "@/lib/timezone";
import { aiFeaturesEnabled } from "@/lib/features";
import { BakeDetail } from "./BakeDetail";
import { DeleteBakeButton } from "./DeleteBakeButton";

export default async function BakeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const id = (await params).id;
  const userId = session.user.id;
  const [bake, user] = await Promise.all([
    prisma.bake.findFirst({
      where: { id, userId },
      include: {
        recipe: {
          include: {
            steps: { orderBy: { sortOrder: "asc" } },
            recipeNotes: { orderBy: { sortOrder: "asc" } },
            ingredients: { orderBy: { sortOrder: "asc" } },
          },
        },
        starterCycle: true,
        doughDevice: { select: { name: true } },
        milestones: { orderBy: { occurredAt: "asc" } },
        events: { orderBy: [{ occurredAt: "asc" }, { sequenceIndex: "asc" }] },
        outcomes: true,
      },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        trackedBakePhases: true,
        timezone: true,
        customBakeEventTypes: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, eventType: true, label: true, phase: true } },
      },
    }),
  ]);
  if (!bake) notFound();
  const trackedBakePhases = (user?.trackedBakePhases as string[] | null) ?? null;
  const customEventTypes = user?.customBakeEventTypes ?? [];
  const userTimezone = session.user.timezone ?? user?.timezone ?? APP_TIMEZONE;
  return (
    <AppLayout>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link href="/bakes" className="text-stone-600 hover:text-stone-900">← Bakes</Link>
          <h1 className="text-2xl font-semibold text-stone-800">{bake.recipe.title}</h1>
        </div>
        <DeleteBakeButton bakeId={bake.id} />
      </div>
      <BakeDetail bake={bake as unknown as React.ComponentProps<typeof BakeDetail>["bake"]} trackedBakePhases={trackedBakePhases} customEventTypes={customEventTypes} userTimezone={userTimezone} aiEnabled={aiFeaturesEnabled()} />
    </AppLayout>
  );
}
