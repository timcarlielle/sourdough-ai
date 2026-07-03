import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { runAndPersistAnalysis } from "db";
import { StarterPredictionService } from "db";
import { getSessionUserId } from "@/lib/session";

/** POST /api/feedings/[id]/cycle-analysis/rerun — re-run analysis for the cycle started by this feeding (debug). */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const feedingId = (await params).id;

  const feeding = await prisma.starterFeeding.findFirst({
    where: { id: feedingId, userId },
    select: { id: true },
  });
  if (!feeding) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const cycle = await prisma.starterCycle.findFirst({
    where: { userId, sourceFeedingId: feedingId },
    select: { id: true, status: true },
  });
  if (!cycle) return NextResponse.json({ error: "No cycle for this feeding" }, { status: 404 });
  if (cycle.status !== "COMPLETED") {
    return NextResponse.json(
      { error: "Cycle must be COMPLETED to re-run analysis" },
      { status: 400 }
    );
  }

  try {
    const { analysisId } = await runAndPersistAnalysis(prisma, cycle.id);
    await StarterPredictionService.onCycleCompleted(prisma, cycle.id);
    return NextResponse.json({ analysisId, cycleId: cycle.id });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Re-run failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
