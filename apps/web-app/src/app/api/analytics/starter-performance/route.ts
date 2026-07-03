import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStarterModel } from "db";
import { getSessionUserId } from "@/lib/session";

/** timeToPeakMinutes(tempC) = a * exp(-k * tempC) + b (matches prediction service). */
function predictTtp(tempC: number, a: number | null, k: number | null, b: number | null): number | null {
  if (a == null || k == null || b == null || !Number.isFinite(tempC)) return null;
  const t = a * Math.exp(-k * tempC) + b;
  return Math.max(30, Math.min(24 * 60, t));
}

/** GET /api/analytics/starter-performance?limit=30&validOnly=1 — cycles with temp, actual ttp, predicted ttp, error + model curve. Debug only. */
export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_STARTER_DEBUG) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const limit = Math.min(100, Math.max(5, parseInt(searchParams.get("limit") ?? "30", 10) || 30));
  const validOnly = searchParams.get("validOnly") === "1";

  const analyses = await prisma.starterCycleAnalysis.findMany({
    where: { userId, ...(validOnly ? { isValid: true, avgAmbientTempC: { not: null } } : {}) },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: {
      cycleId: true,
      avgAmbientTempC: true,
      timeToPeakMinutes: true,
      isValid: true,
    },
  });
  const cycleIds = analyses.map((a) => a.cycleId);
  const cycles = await prisma.starterCycle.findMany({
    where: { id: { in: cycleIds }, userId },
    select: { id: true, startedAt: true, endedAt: true, status: true },
  });
  const cycleMap = new Map(cycles.map((c) => [c.id, c]));

  const model = await getActiveStarterModel(prisma, userId);
  const predictions = model
    ? await prisma.starterPrediction.findMany({
        where: { cycleId: { in: cycleIds }, modelId: model.id },
        select: { cycleId: true, predictedPeakAt: true, errorMinutes: true },
      })
    : [];
  const predByCycle = new Map(predictions.map((p) => [p.cycleId, p]));

  const rows: {
    cycleId: string;
    startedAt: string;
    tempC: number | null;
    actualTimeToPeakMinutes: number | null;
    predictedTimeToPeakMinutes: number | null;
    errorMinutes: number | null;
    isValid: boolean;
  }[] = [];
  for (const a of analyses) {
    const cycle = cycleMap.get(a.cycleId);
    if (!cycle) continue;
    const pred = predByCycle.get(a.cycleId);
    const predictedTtp = pred
      ? (pred.predictedPeakAt.getTime() - cycle.startedAt.getTime()) / (60 * 1000)
      : null;
    rows.push({
      cycleId: a.cycleId,
      startedAt: cycle.startedAt.toISOString(),
      tempC: a.avgAmbientTempC,
      actualTimeToPeakMinutes: a.timeToPeakMinutes,
      predictedTimeToPeakMinutes: predictedTtp,
      errorMinutes: pred?.errorMinutes ?? null,
      isValid: a.isValid,
    });
  }

  let modelCurve: { tempC: number; timeToPeakMinutes: number }[] = [];
  if (model?.paramA != null && model?.paramK != null && model?.paramB != null) {
    for (let tempC = 15; tempC <= 28; tempC += 1) {
      const ttp = predictTtp(tempC, model.paramA, model.paramK, model.paramB);
      if (ttp != null) modelCurve.push({ tempC, timeToPeakMinutes: Math.round(ttp * 10) / 10 });
    }
  }

  return NextResponse.json({
    rows,
    modelCurve,
    modelId: model?.id ?? null,
    modelName: model?.name ?? null,
  });
}
