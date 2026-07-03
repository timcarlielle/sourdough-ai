import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import { VoiceLogWidget } from "@/components/VoiceLogWidget";
import { formatInUserTz } from "@/lib/timezone";
import { aiFeaturesEnabled } from "@/lib/features";
import Link from "next/link";

export default async function FeedingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const feedings = await prisma.starterFeeding.findMany({
    where: { userId: session.user.id },
    orderBy: { fedAt: "desc" },
    include: { device: { select: { name: true } } },
  });
  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-800">Feedings</h1>
        <Link
          href="/feedings/new"
          className="rounded bg-amber-800 px-4 py-2 text-sm text-white hover:bg-amber-900"
        >
          New feeding
        </Link>
      </div>
      {aiFeaturesEnabled() && (
        <div className="mt-4">
          <VoiceLogWidget />
        </div>
      )}
      <ul className="mt-4 space-y-3">
        {feedings.length === 0 ? (
          <p className="text-stone-600">No feedings yet.</p>
        ) : (
          feedings.map((f, index) => {
            const isCurrentCycle = index === 0;
            return (
              <li key={f.id}>
                <Link
                  href={`/feedings/${f.id}`}
                  className="block rounded-lg border border-stone-200 bg-white p-4 hover:bg-stone-50"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium text-stone-900">
                      {formatInUserTz(f.fedAt, session.user.timezone ?? "America/Edmonton")} — {f.starterAmountG}g starter, {f.flourAmountG}g flour, {f.waterAmountG}g water
                    </p>
                    {isCurrentCycle && (
                      <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
                        Current cycle
                      </span>
                    )}
                  </div>
                  {f.device?.name && <p className="mt-1 text-sm text-stone-500">{f.device.name}</p>}
                </Link>
              </li>
            );
          })
        )}
      </ul>
    </AppLayout>
  );
}
