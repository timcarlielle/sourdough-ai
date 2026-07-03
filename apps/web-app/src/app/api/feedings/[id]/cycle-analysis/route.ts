import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

/** PATCH /api/feedings/[id]/cycle-analysis — mark valid/invalid or exclude from training (debug). */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const feedingId = (await params).id;

  const body = await req.json().catch(() => ({}));
  const isValid = body.isValid as boolean | undefined;
  const excludeFromTraining = body.excludeFromTraining as boolean | undefined;

  if (isValid === undefined && excludeFromTraining === undefined) {
    return NextResponse.json(
      { error: "Provide isValid and/or excludeFromTraining" },
      { status: 400 }
    );
  }

  const feeding = await prisma.starterFeeding.findFirst({
    where: { id: feedingId, userId },
    select: { id: true },
  });
  if (!feeding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cycle = await prisma.starterCycle.findFirst({
    where: { userId, sourceFeedingId: feedingId },
    select: { id: true },
  });
  if (!cycle) return NextResponse.json({ error: "No cycle for this feeding" }, { status: 404 });

  const analysis = await prisma.starterCycleAnalysis.findUnique({
    where: { cycleId: cycle.id },
    select: { id: true, meta: true },
  });
  if (!analysis) {
    return NextResponse.json(
      { error: "No analysis for this cycle; run analysis first" },
      { status: 404 }
    );
  }

  const updates: { isValid?: boolean; meta?: object } = {};
  if (isValid !== undefined) updates.isValid = isValid;
  if (excludeFromTraining !== undefined) {
    const meta = (analysis.meta as Record<string, unknown>) ?? {};
    updates.meta = { ...meta, excludeFromTraining };
  }

  await prisma.starterCycleAnalysis.update({
    where: { cycleId: cycle.id },
    data: updates,
  });

  return NextResponse.json({ ok: true, cycleId: cycle.id });
}
