import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

/**
 * Backward scheduling: target completion time → mix time, proof start, bulk start, starter feed time.
 * Uses recipe step estimatedMinutesFromStart to work backward from "bake out" (end).
 */
export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const targetCompletion = searchParams.get("targetCompletion"); // ISO datetime
  const recipeId = searchParams.get("recipeId");

  if (!targetCompletion || !recipeId) {
    return NextResponse.json({ error: "targetCompletion and recipeId required" }, { status: 400 });
  }

  const targetEnd = new Date(targetCompletion);
  if (Number.isNaN(targetEnd.getTime())) {
    return NextResponse.json({ error: "Invalid targetCompletion" }, { status: 400 });
  }

  const recipe = await prisma.recipe.findFirst({
    where: { id: recipeId, userId },
    include: { steps: { orderBy: { sortOrder: "asc" } } },
  });
  if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 404 });

  const steps = recipe.steps;
  const bakeOutStep = steps.find((s) => s.eventType === "bake_completed" || s.eventType === "bake_out");
  const proofStartStep = steps.find((s) => s.eventType === "proof_started" || s.eventPhase === "proofing");
  const mixStep = steps.find((s) => s.eventType === "mix_started" || s.section?.toLowerCase().includes("mix"));

  const minutesFromStart = (s: { estimatedMinutesFromStart: number | null }) => s.estimatedMinutesFromStart ?? 0;
  const bakeOutMinutes = bakeOutStep ? minutesFromStart(bakeOutStep) : 360; // default 6h from start to bake out
  const proofStartMinutes = proofStartStep ? minutesFromStart(proofStartStep) : 240;
  const mixMinutes = mixStep ? minutesFromStart(mixStep) : 0;

  const totalBakeMinutes = bakeOutMinutes;
  const proofDurationMinutes = bakeOutMinutes - proofStartMinutes;
  const bulkEndMinutes = proofStartMinutes;
  const bulkDurationMinutes = bulkEndMinutes - mixMinutes;

  const bakeOutTime = new Date(targetEnd.getTime());
  const mixTime = new Date(bakeOutTime.getTime() - totalBakeMinutes * 60 * 1000);
  const proofStartTime = new Date(mixTime.getTime() + proofStartMinutes * 60 * 1000);
  const bulkStartTime = new Date(mixTime.getTime() + mixMinutes * 60 * 1000);

  // Starter: assume use at peak; recipe may say "X hours before mix" — use 4h default
  const starterHoursBeforeMix = 4;
  const feedTime = new Date(mixTime.getTime() - starterHoursBeforeMix * 60 * 60 * 1000);

  return NextResponse.json({
    targetCompletion: targetEnd.toISOString(),
    mixTime: mixTime.toISOString(),
    proofStartTime: proofStartTime.toISOString(),
    bulkStartTime: bulkStartTime.toISOString(),
    feedTime: feedTime.toISOString(),
    summary: {
      totalBakeMinutes,
      proofDurationMinutes,
      bulkDurationMinutes,
      starterHoursBeforeMix,
    },
  });
}
