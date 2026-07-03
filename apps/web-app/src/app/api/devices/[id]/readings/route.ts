import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const device = await prisma.device.findFirst({
    where: { id, userId: userId },
    select: { id: true, baselineDistanceMm: true },
  });
  if (!device) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 500);
  const readings = await prisma.telemetryReading.findMany({
    where: { deviceId: id },
    orderBy: { recordedAt: "desc" },
    take: limit,
  });
  const baseline = device.baselineDistanceMm ?? null;
  const out = readings.map((r) => {
    const raw = r.distanceMm;
    const heightMm =
      baseline != null && raw != null && Number.isFinite(baseline) && Number.isFinite(raw)
        ? baseline - raw
        : null;
    return { ...r, heightMm };
  });
  return NextResponse.json(out);
}
