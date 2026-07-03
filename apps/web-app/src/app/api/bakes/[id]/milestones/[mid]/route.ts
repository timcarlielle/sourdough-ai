import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getSessionUserId } from "@/lib/session";

const types = ["mix", "autolyse_start", "salt_added", "fold", "shape", "proof_start", "fridge", "bake_in", "bake_out", "score", "steam_on", "steam_off", "other"] as const;

const updateSchema = z.object({
  milestoneType: z.enum(types).optional(),
  occurredAt: z.string().datetime().or(z.string().min(1)).optional(),
  meta: z.record(z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: bakeId, mid } = await params;
  const bake = await prisma.bake.findFirst({
    where: { id: bakeId, userId: userId },
  });
  if (!bake) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const milestone = await prisma.bakeMilestone.findFirst({
    where: { id: mid, bakeId },
  });
  if (!milestone) return NextResponse.json({ error: "Milestone not found" }, { status: 404 });
  try {
    const body = await req.json();
    const data = updateSchema.parse(body);
    const updated = await prisma.bakeMilestone.update({
      where: { id: mid },
      data: {
        ...(data.milestoneType != null && { milestoneType: data.milestoneType }),
        ...(data.occurredAt != null && { occurredAt: new Date(data.occurredAt) }),
        ...(data.meta !== undefined && { meta: (data.meta ?? undefined) as Prisma.InputJsonObject | undefined }),
        ...(data.notes !== undefined && { notes: data.notes }),
      },
    });
    return NextResponse.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string; mid: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { id: bakeId, mid } = await params;
  const bake = await prisma.bake.findFirst({
    where: { id: bakeId, userId: userId },
  });
  if (!bake) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const milestone = await prisma.bakeMilestone.findFirst({
    where: { id: mid, bakeId },
  });
  if (!milestone) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.bakeMilestone.delete({ where: { id: mid } });
  return NextResponse.json({ ok: true });
}
