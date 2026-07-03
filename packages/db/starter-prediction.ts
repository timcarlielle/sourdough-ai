/**
 * Starter Peak Prediction – minimal db access helpers.
 * Pass in your PrismaClient (or tx) so this works from web-app, worker, or ingest.
 */
import type { PrismaClient } from "@prisma/client";

/** Get the single active StarterModel for a user (enforce exactly one active per user). */
export async function getActiveStarterModel(prisma: PrismaClient, userId: string) {
  return prisma.starterModel.findFirst({
    where: { userId, isActive: true },
    orderBy: { updatedAt: "desc" },
  });
}

/** Get the current active starter cycle for a user (status ACTIVE, most recent startedAt). */
export async function getActiveStarterCycle(prisma: PrismaClient, userId: string) {
  return prisma.starterCycle.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    include: { sourceFeeding: true },
  });
}

/** Get the one StarterCycleAnalysis for a cycle, if any. */
export async function getStarterCycleAnalysisByCycleId(prisma: PrismaClient, cycleId: string) {
  return prisma.starterCycleAnalysis.findUnique({
    where: { cycleId },
  });
}

/** Get the latest (only) StarterPrediction for a cycle and model. */
export async function getLatestStarterPredictionForCycle(
  prisma: PrismaClient,
  cycleId: string,
  modelId: string
) {
  return prisma.starterPrediction.findUnique({
    where: { cycleId_modelId: { cycleId, modelId } },
  });
}

/** Get or create the default StarterModel for a user (e.g. on signup). Ensures exactly one active model. */
export async function getOrCreateDefaultStarterModel(prisma: PrismaClient, userId: string) {
  const existing = await getActiveStarterModel(prisma, userId);
  if (existing) return existing;

  return prisma.$transaction(async (tx) => {
    const again = await tx.starterModel.findFirst({
      where: { userId, isActive: true },
    });
    if (again) return again;

    const created = await tx.starterModel.create({
      data: {
        userId,
        name: "Default",
        isActive: true,
        isLocked: false,
        modelType: "TEMP_ONLY",
        paramA: null,
        paramK: null,
        paramB: null,
        sigmaBaseMinutes: 270,
        trainedOnCycles: 0,
        meta: { note: "Conservative default until trained" },
      },
    });
    return created;
  });
}
