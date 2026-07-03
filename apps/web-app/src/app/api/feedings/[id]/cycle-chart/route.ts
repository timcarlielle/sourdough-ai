import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { StarterPredictionService } from "db";
import { getSessionUserId } from "@/lib/session";

/** GET /api/feedings/[id]/cycle-chart — rise data + predicted for the cycle started by this feeding. */
export async function GET(
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
    select: { id: true, startedAt: true, endedAt: true, deviceId: true },
  });

  const lastCycle = await prisma.starterCycle.findFirst({
    where: { userId },
    orderBy: { startedAt: "desc" },
    select: { id: true },
  });
  const isCurrentCycle = !!cycle && !!lastCycle && cycle.id === lastCycle.id;

  if (!cycle) {
    return NextResponse.json({
      cycle: null,
      feedingCycleRise: null,
      feedingCyclePredictedRise: null,
      isCurrentCycle: false,
    });
  }

  const devices = await prisma.device.findMany({
    where: { userId, isActive: true },
    select: { id: true, deviceType: true },
  });

  const since = cycle.startedAt;
  const twentyFourHoursLater = new Date(since.getTime() + 24 * 60 * 60 * 1000);
  const cycleEndOrNow = cycle.endedAt ?? new Date();
  const until = new Date(Math.min(cycleEndOrNow.getTime(), twentyFourHoursLater.getTime()));

  const starterDeviceIds = cycle.deviceId
    ? [cycle.deviceId]
    : devices.filter((d) => d.deviceType === "starter_monitor").map((d) => d.id);

  const devicesWithBaseline = await prisma.device.findMany({
    where: { id: { in: starterDeviceIds }, userId },
    select: { id: true, baselineDistanceMm: true },
  });
  const baselineByDevice = Object.fromEntries(
    devicesWithBaseline
      .filter((d) => d.baselineDistanceMm != null)
      .map((d) => [d.id, d.baselineDistanceMm!])
  ) as Record<string, number>;

  function riseMm(baseline: number | undefined, raw: number | null | undefined): number | null {
    if (raw == null || !Number.isFinite(raw)) return null;
    if (baseline == null || !Number.isFinite(baseline)) return raw;
    const rise = baseline - raw;
    return Number.isFinite(rise) ? rise : null;
  }

  let feedingCycleRise: { recordedAt: string; distanceMm: number | null }[] = [];
  if (starterDeviceIds.length > 0) {
    const riseReadings = await prisma.telemetryReading.findMany({
      where: {
        deviceId: { in: starterDeviceIds },
        recordedAt: { gte: since, lte: until },
        readingType: "starter",
      },
      orderBy: { recordedAt: "asc" },
      select: { recordedAt: true, distanceMm: true, deviceId: true },
    });
    feedingCycleRise = riseReadings.map((r) => ({
      recordedAt: r.recordedAt.toISOString(),
      distanceMm: riseMm(baselineByDevice[r.deviceId], r.distanceMm),
    }));
  }

  const prediction = await StarterPredictionService.getPredictionForCycle(prisma, cycle.id);
  const startMs = cycle.startedAt.getTime();
  let feedingCyclePredictedRise: { recordedAt: string; distanceMm: number }[] | null = null;
  if (prediction?.prediction.predictedSeries) {
    const firstReadings = feedingCycleRise
      .filter((r) => r.distanceMm != null)
      .slice(0, 3)
      .map((r) => r.distanceMm!);
    const startHeightMm = firstReadings.length > 0
      ? firstReadings.reduce((a, b) => a + b, 0) / firstReadings.length
      : 100;
    feedingCyclePredictedRise = prediction.prediction.predictedSeries.map((p) => ({
      recordedAt: new Date(startMs + p.tMin * 60 * 1000).toISOString(),
      distanceMm: Math.round((startHeightMm + p.heightMm) * 10) / 10,
    }));
  }

  return NextResponse.json({
    cycle: { startedAt: cycle.startedAt, endedAt: cycle.endedAt },
    feedingCycleRise: feedingCycleRise.length ? feedingCycleRise : null,
    feedingCyclePredictedRise,
    isCurrentCycle,
    prediction: prediction
      ? {
          predictedPeakAt: prediction.prediction.predictedPeakAt.toISOString(),
          predictedPeakStartAt: prediction.prediction.predictedPeakStartAt.toISOString(),
          predictedPeakEndAt: prediction.prediction.predictedPeakEndAt.toISOString(),
          confidence: prediction.prediction.confidence,
        }
      : null,
    insufficientData: !prediction ? "Collect 2–3 cycles with temperature data to get predictions." : null,
  });
}
