import type React from "react";
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import { formatInUserTz } from "@/lib/timezone";
import Link from "next/link";
import { FeedingDetailForm } from "./FeedingDetailForm";
import { FeedingCycleChartSection } from "./FeedingCycleChartSection";

export default async function FeedingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const id = (await params).id;
  const feeding = await prisma.starterFeeding.findFirst({
    where: { id, userId: session.user.id },
    include: { device: { select: { id: true, name: true } } },
  });
  if (!feeding) notFound();
  const devices = await prisma.device.findMany({
    where: { userId: session.user.id, deviceType: "starter_monitor" },
    select: { id: true, name: true },
  });
  const tz = session.user.timezone ?? "America/Edmonton";
  return (
    <AppLayout>
      <div className="flex items-center gap-4">
        <Link href="/feedings" className="text-stone-600 hover:text-stone-900">← Feedings</Link>
        <h1 className="text-2xl font-semibold text-stone-800">
          Feeding {formatInUserTz(feeding.fedAt, tz)}
        </h1>
      </div>
      <FeedingDetailForm feeding={feeding as unknown as React.ComponentProps<typeof FeedingDetailForm>["feeding"]} devices={devices} />
      <FeedingCycleChartSection feedingId={feeding.id} userTimezone={tz} />
    </AppLayout>
  );
}
