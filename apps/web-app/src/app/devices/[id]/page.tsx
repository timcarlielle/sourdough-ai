import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { APP_TIMEZONE } from "@/lib/timezone";
import { AppLayout } from "@/components/AppLayout";
import Link from "next/link";
import { DeviceEditForm } from "./DeviceEditForm";
import { DeviceReadings } from "./DeviceReadings";
import { DeviceBaseline } from "./DeviceBaseline";

export default async function DeviceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  const userTimezone = session.user.timezone ?? APP_TIMEZONE;
  const id = (await params).id;
  const device = await prisma.device.findFirst({
    where: { id, userId: session.user.id },
    select: { id: true, name: true, deviceType: true, isActive: true, lastSeenAt: true, baselineDistanceMm: true },
  });
  if (!device) notFound();
  return (
    <AppLayout>
      <div className="flex items-center gap-4">
        <Link href="/devices" className="text-stone-600 hover:text-stone-900">← Devices</Link>
        <h1 className="text-2xl font-semibold text-stone-800">{device.name}</h1>
      </div>
      <DeviceEditForm
        device={{
          id: device.id,
          name: device.name,
          deviceType: device.deviceType,
          isActive: device.isActive,
          lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
        }}
        userTimezone={userTimezone}
      />
      <DeviceBaseline deviceId={device.id} baselineDistanceMm={device.baselineDistanceMm} />
      <DeviceReadings deviceId={device.id} userTimezone={userTimezone} />
    </AppLayout>
  );
}
