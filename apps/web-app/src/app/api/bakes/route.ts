import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const planStepSchema = z.object({
  type: z.enum(["FEED", "FRIDGE_IN", "FRIDGE_OUT", "PEAK_WINDOW", "MIX"]),
  at: z.string(),
  label: z.string().optional(),
});
const createSchema = z.object({
  recipeId: z.string().uuid(),
  starterCycleId: z.string().uuid().optional().nullable(),
  doughDeviceId: z.string().uuid().optional().nullable(),
  startedAt: z.string().datetime().or(z.string().min(1)),
  doughBatchName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  starterPlanSteps: z.array(planStepSchema).optional().nullable(),
});

export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bakes = await prisma.bake.findMany({
    where: { userId: userId },
    orderBy: { startedAt: "desc" },
    include: {
      recipe: { select: { id: true, title: true } },
      starterCycle: { select: { id: true, startedAt: true } },
      doughDevice: { select: { id: true, name: true } },
    },
  });
  return NextResponse.json(bakes);
}

export async function POST(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    const recipe = await prisma.recipe.findFirst({ where: { id: parsed.recipeId, userId } });
    if (!recipe) return NextResponse.json({ error: "Recipe not found" }, { status: 400 });
    if (parsed.starterCycleId) {
      const cycle = await prisma.starterCycle.findFirst({ where: { id: parsed.starterCycleId, userId } });
      if (!cycle) return NextResponse.json({ error: "Starter cycle not found" }, { status: 400 });
    }
    if (parsed.doughDeviceId) {
      const dev = await prisma.device.findFirst({ where: { id: parsed.doughDeviceId, userId } });
      if (!dev) return NextResponse.json({ error: "Device not found" }, { status: 400 });
    }
    const bake = await prisma.bake.create({
      data: {
        userId,
        recipeId: parsed.recipeId,
        starterCycleId: parsed.starterCycleId ?? undefined,
        doughDeviceId: parsed.doughDeviceId ?? undefined,
        startedAt: new Date(parsed.startedAt),
        doughBatchName: parsed.doughBatchName ?? undefined,
        notes: parsed.notes ?? undefined,
        starterPlanSteps: parsed.starterPlanSteps ?? undefined,
      },
      include: { recipe: { select: { title: true } } },
    });
    return NextResponse.json(bake);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
