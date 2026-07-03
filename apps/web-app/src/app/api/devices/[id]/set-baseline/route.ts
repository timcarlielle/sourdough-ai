import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

/** POST: set device baseline from its most recent reading (empty-jar reference). */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(_req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;

  const device = await prisma.device.findFirst({
    where: { id, userId: userId },
    select: { id: true },
  });
  if (!device) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const latest = await prisma.telemetryReading.findFirst({
    where: { deviceId: id },
    orderBy: { recordedAt: "desc" },
    select: { distanceMm: true },
  });
  if (latest?.distanceMm == null) {
    return NextResponse.json(
      { error: "No distance reading yet. Send at least one reading from the device, then try again." },
      { status: 400 }
    );
  }

  await prisma.device.update({
    where: { id },
    data: { baselineDistanceMm: latest.distanceMm },
  });
  return NextResponse.json({ baselineDistanceMm: latest.distanceMm });
}
