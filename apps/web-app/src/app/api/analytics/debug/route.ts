import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const bakeId = searchParams.get("bakeId");

  if (!bakeId) {
    return NextResponse.json({ error: "bakeId required" }, { status: 400 });
  }

  const bake = await prisma.bake.findFirst({
    where: { id: bakeId, userId },
    include: {
      recipe: { select: { id: true, title: true, steps: { orderBy: { sortOrder: "asc" } } } },
      starterCycle: { select: { id: true, startedAt: true, endedAt: true, deviceId: true } },
      doughDevice: { select: { id: true } },
      outcomes: true,
    },
  });
  if (!bake) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const adjustmentSet = await prisma.recipeAdjustmentSet.findFirst({
    where: { bakeId },
    orderBy: { createdAt: "desc" },
  });

  type Payload = {
    suggestions?: unknown[];
    rulesTriggered?: string[];
    starterMetrics?: Record<string, unknown>;
    doughMetrics?: Record<string, unknown>;
  };
  const raw = adjustmentSet?.suggestions ?? null;
  const payload = raw as Payload | unknown[] | null;
  const suggestions = Array.isArray(payload) ? payload : Array.isArray((payload as Payload)?.suggestions) ? (payload as Payload).suggestions! : (payload && typeof payload === "object" && "suggestions" in payload ? (payload as { suggestions: unknown[] }).suggestions : []);
  const rulesTriggered = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Payload).rulesTriggered ?? [] : [];
  const starterMetrics = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Payload).starterMetrics ?? null : null;
  const doughMetrics = payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as Payload).doughMetrics ?? null : null;

  let starterCurve: { recordedAt: string; distanceMm: number | null }[] = [];
  let doughCurve: { recordedAt: string; distanceMm: number | null }[] = [];

  if (bake.starterCycle?.deviceId) {
    const cycleEnd = bake.starterCycle.endedAt ?? bake.endedAt ?? new Date();
    const readings = await prisma.telemetryReading.findMany({
      where: {
        userId,
        deviceId: bake.starterCycle.deviceId,
        readingType: "starter",
        recordedAt: { gte: bake.starterCycle.startedAt, lte: cycleEnd },
      },
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true, distanceMm: true },
    });
    starterCurve = readings.map((r) => ({ recordedAt: r.recordedAt.toISOString(), distanceMm: r.distanceMm }));
  }

  if (bake.doughDevice?.id) {
    const end = bake.endedAt ?? new Date();
    const readings = await prisma.telemetryReading.findMany({
      where: {
        deviceId: bake.doughDevice.id,
        readingType: "dough",
        recordedAt: { gte: bake.startedAt, lte: end },
      },
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true, distanceMm: true },
    });
    doughCurve = readings.map((r) => ({ recordedAt: r.recordedAt.toISOString(), distanceMm: r.distanceMm }));
  }

  return NextResponse.json({
    bake: {
      id: bake.id,
      startedAt: bake.startedAt,
      endedAt: bake.endedAt,
      recipe: bake.recipe,
      outcomes: bake.outcomes,
    },
    adjustmentSet: adjustmentSet
      ? {
          id: adjustmentSet.id,
          confidenceScore: adjustmentSet.confidenceScore,
          createdAt: adjustmentSet.createdAt,
          suggestions,
          rulesTriggered,
          starterMetrics,
          doughMetrics,
        }
      : null,
    starterCurve,
    doughCurve,
  });
}
