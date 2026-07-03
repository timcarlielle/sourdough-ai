import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { ensureActiveCycleForFeeding, StarterPredictionService } from "db";
import { getSessionUserId } from "@/lib/session";

const createSchema = z.object({
  deviceId: z.string().uuid().optional().nullable(),
  fedAt: z.string().datetime().or(z.string().min(1)),
  starterAmountG: z.number().min(0),
  flourAmountG: z.number().min(0),
  flourNotes: z.string().optional().nullable(),
  waterAmountG: z.number().min(0),
  waterTempC: z.number().optional().nullable(),
  saltG: z.number().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const feedings = await prisma.starterFeeding.findMany({
    where: { userId: userId },
    orderBy: { fedAt: "desc" },
    include: { device: { select: { id: true, name: true } } },
  });
  return NextResponse.json(feedings);
}

export async function POST(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    if (parsed.deviceId) {
      const dev = await prisma.device.findFirst({
        where: { id: parsed.deviceId, userId },
      });
      if (!dev) return NextResponse.json({ error: "Device not found" }, { status: 400 });
    }
    const fedAt = new Date(parsed.fedAt);
    const feeding = await prisma.starterFeeding.create({
      data: {
        userId,
        deviceId: parsed.deviceId || undefined,
        fedAt,
        starterAmountG: parsed.starterAmountG,
        flourAmountG: parsed.flourAmountG,
        flourNotes: parsed.flourNotes ?? undefined,
        waterAmountG: parsed.waterAmountG,
        waterTempC: parsed.waterTempC ?? undefined,
        saltG: parsed.saltG ?? undefined,
        notes: parsed.notes ?? undefined,
      },
    });
    const { closedCycleId } = await ensureActiveCycleForFeeding(prisma, feeding.id);
    if (closedCycleId) {
      StarterPredictionService.onCycleCompleted(prisma, closedCycleId).catch(() => {});
    }
    return NextResponse.json(feeding);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
