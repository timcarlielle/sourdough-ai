/**
 * Starter Cycle lifecycle engine.
 * Primary boundaries from StarterFeeding; idempotent methods; never two ACTIVE cycles per user.
 */
import type { Prisma, PrismaClient } from "@prisma/client";
import { getActiveStarterCycle } from "./starter-prediction";

const OVERDUE_HOURS = 48;
const INFERRED_LOOKBACK_HOURS = 24;
const ALLOW_INFERRED_ENV = "ALLOW_INFERRED_STARTER_CYCLES";

/** Use feeding.fedAt as the canonical "logged at" time for cycle boundaries. */
function feedingTime(feeding: { fedAt: Date; createdAt: Date }): Date {
  return feeding.fedAt;
}

/**
 * Close the current ACTIVE cycle (if any) for this user at newFeedingAt.
 * Idempotent: if no active cycle, no-op and returns null.
 */
export async function closeActiveCycleOnNewFeeding(
  prisma: PrismaClient,
  userId: string,
  newFeedingAt: Date
): Promise<{ id: string; startedAt: Date } | null> {
  const active = await prisma.starterCycle.findFirst({
    where: { userId, status: "ACTIVE" },
    orderBy: { startedAt: "desc" },
    select: { id: true, startedAt: true },
  });
  if (!active) return null;

  await prisma.starterCycle.update({
    where: { id: active.id },
    data: { endedAt: newFeedingAt, status: "COMPLETED" },
  });
  return active;
}

export type EnsureActiveCycleResult = {
  cycle: { id: string; userId: string; startedAt: Date; status: string };
  closedCycleId: string | null;
};

/**
 * Ensure there is exactly one ACTIVE cycle for this feeding: close any previous
 * ACTIVE cycle at this feeding's time, then create a new cycle for the feeding.
 * Idempotent: if a cycle already exists for this feedingId, returns it without creating a second.
 * Also closes any ACTIVE cycle that has been open >48h (safety cutoff).
 * Returns the new (or existing) cycle and the id of the cycle that was closed (if any) so caller can run analysis/train.
 */
export async function ensureActiveCycleForFeeding(
  prisma: PrismaClient | Prisma.TransactionClient,
  feedingId: string
): Promise<EnsureActiveCycleResult> {
  // Accept either a plain client (wrap in a transaction) or an existing transaction client
  const run = async (tx: Prisma.TransactionClient): Promise<EnsureActiveCycleResult> => {
    const feeding = await tx.starterFeeding.findUnique({
      where: { id: feedingId },
      select: { id: true, userId: true, fedAt: true, createdAt: true, deviceId: true },
    });
    if (!feeding) throw new Error(`StarterFeeding not found: ${feedingId}`);

    const existingCycle = await tx.starterCycle.findFirst({
      where: { sourceFeedingId: feedingId },
      select: { id: true, userId: true, startedAt: true, status: true },
    });
    if (existingCycle) {
      return { cycle: existingCycle, closedCycleId: null };
    }

    const at = feedingTime(feeding);

    // Safety cutoff: close any ACTIVE cycle older than 48h (for this user)
    const overdueCutoff = new Date(at.getTime() - OVERDUE_HOURS * 60 * 60 * 1000);
    const overdue = await tx.starterCycle.findMany({
      where: { userId: feeding.userId, status: "ACTIVE" },
      select: { id: true, startedAt: true },
    });
    for (const c of overdue) {
      if (c.startedAt < overdueCutoff) {
        const endAt = new Date(c.startedAt.getTime() + OVERDUE_HOURS * 60 * 60 * 1000);
        await tx.starterCycle.update({
          where: { id: c.id },
          data: { endedAt: endAt, status: "COMPLETED" },
        });
      }
    }

    const previousActive = await tx.starterCycle.findFirst({
      where: { userId: feeding.userId, status: "ACTIVE" },
      orderBy: { startedAt: "desc" },
      select: { id: true },
    });
    let closedCycleId: string | null = null;
    if (previousActive) {
      closedCycleId = previousActive.id;
      await tx.starterCycle.update({
        where: { id: previousActive.id },
        data: { endedAt: at, status: "COMPLETED" },
      });
    }

    const cycle = await tx.starterCycle.create({
      data: {
        userId: feeding.userId,
        deviceId: feeding.deviceId ?? undefined,
        startedAt: at,
        sourceFeedingId: feedingId,
        status: "ACTIVE",
        source: "FEEDING",
      },
      select: { id: true, userId: true, startedAt: true, status: true },
    });
    return { cycle, closedCycleId };
  };
  if ("$transaction" in prisma) return prisma.$transaction(run);
  return run(prisma);
}

/**
 * Get the current ACTIVE cycle for the user, if any.
 */
export async function getActiveCycle(prisma: PrismaClient, userId: string) {
  return getActiveStarterCycle(prisma, userId);
}

/**
 * Safety cutoff: end any ACTIVE cycle that has been open longer than OVERDUE_HOURS.
 * Sets endedAt = startedAt + 48h and status = COMPLETED.
 * Returns the number of cycles closed.
 */
export async function closeOverdueCycles(prisma: PrismaClient, userId: string): Promise<number> {
  const cutoff = new Date(Date.now() - OVERDUE_HOURS * 60 * 60 * 1000);
  const active = await prisma.starterCycle.findMany({
    where: { userId, status: "ACTIVE" },
    select: { id: true, startedAt: true },
  });
  let closed = 0;
  for (const c of active) {
    const endAt = new Date(c.startedAt.getTime() + OVERDUE_HOURS * 60 * 60 * 1000);
    if (c.startedAt < cutoff) {
      await prisma.starterCycle.update({
        where: { id: c.id },
        data: { endedAt: endAt, status: "COMPLETED" },
      });
      closed += 1;
    }
  }
  return closed;
}

/**
 * Optional: create an INFERRED cycle from the first reading in the last 24h if there is
 * no ACTIVE cycle and no feeding in that window. Behind env ALLOW_INFERRED_STARTER_CYCLES.
 */
export async function ensureInferredCycleIfNeeded(
  prisma: PrismaClient,
  userId: string,
  deviceId: string
): Promise<{ id: string } | null> {
  if (process.env[ALLOW_INFERRED_ENV] !== "1" && process.env[ALLOW_INFERRED_ENV] !== "true") {
    return null;
  }

  const active = await getActiveCycle(prisma, userId);
  if (active) return null;

  const since = new Date(Date.now() - INFERRED_LOOKBACK_HOURS * 60 * 60 * 1000);
  const recentFeeding = await prisma.starterFeeding.findFirst({
    where: { userId, fedAt: { gte: since } },
    select: { id: true },
  });
  if (recentFeeding) return null;

  const firstReading = await prisma.telemetryReading.findFirst({
    where: {
      userId,
      deviceId,
      readingType: "starter",
      recordedAt: { gte: since },
    },
    orderBy: { recordedAt: "asc" },
    select: { recordedAt: true },
  });
  if (!firstReading) return null;

  const cycle = await prisma.starterCycle.create({
    data: {
      userId,
      deviceId,
      startedAt: firstReading.recordedAt,
      status: "ACTIVE",
      source: "INFERRED",
    },
    select: { id: true },
  });
  return cycle;
}

/**
 * Sanity check: assert at most one ACTIVE cycle per user. Throws if invariant violated.
 */
export async function assertSingleActiveCyclePerUser(prisma: PrismaClient, userId?: string): Promise<void> {
  const where = userId ? { userId } : {};
  const actives = await prisma.starterCycle.findMany({
    where: { ...where, status: "ACTIVE" },
    select: { id: true, userId: true, startedAt: true },
  });
  const byUser = new Map<string, typeof actives>();
  for (const c of actives) {
    const list = byUser.get(c.userId) ?? [];
    list.push(c);
    byUser.set(c.userId, list);
  }
  for (const [uid, list] of byUser) {
    if (list.length > 1) {
      throw new Error(
        `Invariant: at most one ACTIVE cycle per user. User ${uid} has ${list.length}: ${list.map((c) => c.id).join(", ")}`
      );
    }
  }
}
