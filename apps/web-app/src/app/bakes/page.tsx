import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import { formatInUserTz } from "@/lib/timezone";
import Link from "next/link";

export default async function BakesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const bakes = await prisma.bake.findMany({
    where: { userId: session.user.id },
    orderBy: { startedAt: "desc" },
    include: { recipe: { select: { title: true } } },
  });
  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-800">Bakes</h1>
        <Link href="/bakes/new" className="rounded bg-amber-800 px-4 py-2 text-sm text-white hover:bg-amber-900">New bake</Link>
      </div>
      <ul className="mt-4 space-y-3">
        {bakes.length === 0 ? (
          <p className="text-stone-600">No bakes yet.</p>
        ) : (
          bakes.map((b) => (
            <li key={b.id}>
              <Link href={`/bakes/${b.id}`} className="block rounded-lg border border-stone-200 bg-white p-4 hover:bg-stone-50">
                <p className="font-medium text-stone-900">{b.recipe.title}</p>
                <p className="text-sm text-stone-500">
                  {formatInUserTz(b.startedAt, session.user.timezone ?? "America/Edmonton")}
                  {b.endedAt && ` – ${formatInUserTz(b.endedAt, session.user.timezone ?? "America/Edmonton")}`}
                </p>
              </Link>
            </li>
          ))
        )}
      </ul>
    </AppLayout>
  );
}
