import type React from "react";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_TIMEZONE } from "@/lib/timezone";
import { AppLayout } from "@/components/AppLayout";
import Link from "next/link";
import { DeviceList } from "./DeviceList";
import { CreateSiriTokenButton } from "./CreateSiriTokenButton";

export default async function DevicesPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userTimezone = session.user.timezone ?? APP_TIMEZONE;
  const devices = await prisma.device.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return (
    <AppLayout>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-stone-800">Devices</h1>
        <Link
          href="/devices/new"
          className="rounded bg-amber-800 px-4 py-2 text-sm text-white hover:bg-amber-900"
        >
          Add device
        </Link>
      </div>
      <DeviceList devices={devices as unknown as React.ComponentProps<typeof DeviceList>["devices"]} userTimezone={userTimezone} />
      <CreateSiriTokenButton />
    </AppLayout>
  );
}
