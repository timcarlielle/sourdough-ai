import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStarterCycle, StarterPredictionService } from "db";
import { getSessionUserId } from "@/lib/session";

/** POST /api/analytics/starter-model/force-prediction — recompute prediction for active cycle. Debug only. */
export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_STARTER_DEBUG) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const active = await getActiveStarterCycle(prisma, userId);
  if (!active) {
    return NextResponse.json({ error: "No active starter cycle" }, { status: 404 });
  }

  const result = await StarterPredictionService.getPredictionForCycle(prisma, active.id);
  if (!result) {
    return NextResponse.json(
      { error: "Could not compute prediction (insufficient model data or cycle)" },
      { status: 422 }
    );
  }

  return NextResponse.json({
    cycleId: active.id,
    predictedPeakAt: result.prediction.predictedPeakAt.toISOString(),
    predictedTimeToPeakMinutes: result.predictedTimeToPeakMinutes,
    confidence: result.prediction.confidence,
  });
}
