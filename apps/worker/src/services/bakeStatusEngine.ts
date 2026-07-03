import type { PrismaClient } from "@prisma/client";

/** Human-readable label for event type (fold_performed -> "fold performed") */
function labelForEventType(eventType: string): string {
  return eventType.replace(/_/g, " ");
}

export type BakeStatusResult = {
  hasActiveBake: boolean;
  currentPhase: string | null;
  nextStepName: string | null;
  nextDueAt: Date | null;
  stepNotes: string | null;
  upcomingStepName: string | null;
  upcomingStepTime: Date | null;
  recipeTitle: string | null;
};

export async function computeBakeStatus(prisma: PrismaClient, userId: string): Promise<BakeStatusResult> {
  const now = new Date();

  const bake = await prisma.bake.findFirst({
    where: { userId, endedAt: null },
    orderBy: { startedAt: "desc" },
    include: {
      recipe: {
        include: {
          steps: { orderBy: { sortOrder: "asc" } },
        },
      },
      events: { orderBy: [{ occurredAt: "asc" }, { sequenceIndex: "asc" }] },
    },
  });

  if (!bake) {
    return {
      hasActiveBake: false,
      currentPhase: null,
      nextStepName: null,
      nextDueAt: null,
      stepNotes: null,
      upcomingStepName: null,
      upcomingStepTime: null,
      recipeTitle: null,
    };
  }

  const startedAt = bake.startedAt.getTime();
  const nowMs = now.getTime();
  const steps = bake.recipe?.steps ?? [];
  const events = bake.events;

  type StepRow = { at: number; label: string; stepText: string; eventType: string | null; index: number };
  const stepRows: StepRow[] = steps
    .filter((s) => s.estimatedMinutesFromStart != null)
    .map((s, index) => ({
      at: startedAt + (s.estimatedMinutesFromStart ?? 0) * 60 * 1000,
      label: s.eventType ? labelForEventType(s.eventType) : s.section,
      stepText: s.stepText,
      eventType: s.eventType,
      index,
    }));

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const currentPhase = lastEvent ? labelForEventType(lastEvent.eventType) : stepRows[0]?.label ?? null;

  let nextStep: StepRow | null = null;
  let upcomingStep: StepRow | null = null;

  for (let i = 0; i < stepRows.length; i++) {
    const step = stepRows[i];
    const completed = events.some(
      (e) => e.eventType === step.eventType || Math.abs(new Date(e.occurredAt).getTime() - step.at) < 15 * 60 * 1000
    );
    if (completed) continue;
    if (step.at >= nowMs) {
      if (!nextStep) {
        nextStep = step;
        upcomingStep = stepRows[i + 1] ?? null;
        break;
      }
    }
  }
  if (!nextStep && stepRows.length > 0) {
    nextStep = stepRows.find((s) => !events.some((e) => e.eventType === s.eventType)) ?? null;
    if (nextStep) upcomingStep = stepRows[nextStep.index + 1] ?? null;
  }

  return {
    hasActiveBake: true,
    currentPhase,
    nextStepName: nextStep?.label ?? null,
    nextDueAt: nextStep ? new Date(nextStep.at) : null,
    stepNotes: nextStep?.stepText ?? null,
    upcomingStepName: upcomingStep?.label ?? null,
    upcomingStepTime: upcomingStep ? new Date(upcomingStep.at) : null,
    recipeTitle: bake.recipe?.title ?? null,
  };
}
