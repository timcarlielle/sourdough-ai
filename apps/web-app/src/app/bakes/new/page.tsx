import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import Link from "next/link";
import { NewBakeForm } from "./NewBakeForm";

export default async function NewBakePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const [recipes, cycles, doughDevices] = await Promise.all([
    prisma.recipe.findMany({ where: { userId: session.user.id }, orderBy: [{ isDefault: "desc" }, { title: "asc" }], select: { id: true, title: true } }),
    prisma.starterCycle.findMany({ where: { userId: session.user.id }, orderBy: { startedAt: "desc" }, take: 50, select: { id: true, startedAt: true } }),
    prisma.device.findMany({ where: { userId: session.user.id, deviceType: "dough_monitor" }, select: { id: true, name: true } }),
  ]);
  return (
    <AppLayout>
      <div className="flex items-center gap-4">
        <Link href="/bakes" className="text-stone-600 hover:text-stone-900">← Bakes</Link>
        <h1 className="text-2xl font-semibold text-stone-800">New bake</h1>
      </div>
      <NewBakeForm recipes={recipes} cycles={cycles} doughDevices={doughDevices} />
    </AppLayout>
  );
}
