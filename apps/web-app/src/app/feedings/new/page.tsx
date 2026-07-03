import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AppLayout } from "@/components/AppLayout";
import Link from "next/link";
import { NewFeedingForm } from "./NewFeedingForm";

export default async function NewFeedingPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const devices = await prisma.device.findMany({
    where: { userId: session.user.id, deviceType: "starter_monitor", isActive: true },
    select: { id: true, name: true },
  });
  return (
    <AppLayout>
      <div className="flex items-center gap-4">
        <Link href="/feedings" className="text-stone-600 hover:text-stone-900">← Feedings</Link>
        <h1 className="text-2xl font-semibold text-stone-800">New feeding</h1>
      </div>
      <NewFeedingForm devices={devices} />
    </AppLayout>
  );
}
