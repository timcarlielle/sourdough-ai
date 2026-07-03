import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const updateSchema = z.object({
  deviceId: z.string().uuid().optional().nullable(),
  fedAt: z.string().datetime().or(z.string().min(1)).optional(),
  starterAmountG: z.number().min(0).optional(),
  flourAmountG: z.number().min(0).optional(),
  flourNotes: z.string().optional().nullable(),
  waterAmountG: z.number().min(0).optional(),
  waterTempC: z.number().optional().nullable(),
  saltG: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const feeding = await prisma.starterFeeding.findFirst({
    where: { id, userId: userId },
    include: { device: { select: { id: true, name: true } } },
  });
  if (!feeding) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(feeding);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const existing = await prisma.starterFeeding.findFirst({
    where: { id, userId: userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await req.json();
    const data = updateSchema.parse(body);
    if (data.deviceId !== undefined && data.deviceId) {
      const dev = await prisma.device.findFirst({
        where: { id: data.deviceId, userId: userId },
      });
      if (!dev) return NextResponse.json({ error: "Device not found" }, { status: 400 });
    }
    const feeding = await prisma.starterFeeding.update({
      where: { id },
      data: {
        ...(data.fedAt != null && { fedAt: new Date(data.fedAt) }),
        ...(data.starterAmountG != null && { starterAmountG: data.starterAmountG }),
        ...(data.flourAmountG != null && { flourAmountG: data.flourAmountG }),
        ...(data.flourNotes !== undefined && { flourNotes: data.flourNotes }),
        ...(data.waterAmountG != null && { waterAmountG: data.waterAmountG }),
        ...(data.waterTempC !== undefined && { waterTempC: data.waterTempC }),
        ...(data.saltG !== undefined && { saltG: data.saltG }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.deviceId !== undefined && { deviceId: data.deviceId || null }),
      },
    });
    return NextResponse.json(feeding);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const existing = await prisma.starterFeeding.findFirst({
    where: { id, userId: userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.starterFeeding.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
