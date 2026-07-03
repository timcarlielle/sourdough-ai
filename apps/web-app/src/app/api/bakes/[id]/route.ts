import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const updateSchema = z.object({
  recipeId: z.string().uuid().optional(),
  starterCycleId: z.string().uuid().optional().nullable(),
  doughDeviceId: z.string().uuid().optional().nullable(),
  startedAt: z.string().datetime().or(z.string().min(1)).optional(),
  endedAt: z.string().datetime().or(z.string().min(1)).optional().nullable(),
  doughBatchName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const bake = await prisma.bake.findFirst({
    where: { id, userId: userId },
    include: {
      recipe: true,
      starterCycle: true,
      doughDevice: { select: { id: true, name: true } },
      milestones: { orderBy: { occurredAt: "asc" } },
      outcomes: true,
    },
  });
  if (!bake) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(bake);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const existing = await prisma.bake.findFirst({
    where: { id, userId: userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await req.json();
    const data = updateSchema.parse(body);
    if (data.recipeId) {
      const r = await prisma.recipe.findFirst({ where: { id: data.recipeId, userId } });
      if (!r) return NextResponse.json({ error: "Recipe not found" }, { status: 400 });
    }
    if (data.starterCycleId) {
      const c = await prisma.starterCycle.findFirst({ where: { id: data.starterCycleId, userId } });
      if (!c) return NextResponse.json({ error: "Starter cycle not found" }, { status: 400 });
    }
    if (data.doughDeviceId) {
      const d = await prisma.device.findFirst({ where: { id: data.doughDeviceId, userId } });
      if (!d) return NextResponse.json({ error: "Device not found" }, { status: 400 });
    }
    const bake = await prisma.bake.update({
      where: { id },
      data: {
        ...(data.recipeId != null && { recipeId: data.recipeId }),
        ...(data.starterCycleId !== undefined && { starterCycleId: data.starterCycleId }),
        ...(data.doughDeviceId !== undefined && { doughDeviceId: data.doughDeviceId }),
        ...(data.startedAt != null && { startedAt: new Date(data.startedAt) }),
        ...(data.endedAt !== undefined && { endedAt: data.endedAt ? new Date(data.endedAt) : null }),
        ...(data.doughBatchName !== undefined && { doughBatchName: data.doughBatchName }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
      include: { recipe: true, milestones: true, outcomes: true },
    });
    return NextResponse.json(bake);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const existing = await prisma.bake.findFirst({
    where: { id, userId: userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.bake.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
