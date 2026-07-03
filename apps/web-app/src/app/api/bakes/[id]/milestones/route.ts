import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { getSessionUserId } from "@/lib/session";

const types = ["mix", "autolyse_start", "salt_added", "fold", "shape", "proof_start", "fridge", "bake_in", "bake_out", "score", "steam_on", "steam_off", "other"] as const;

const createSchema = z.object({
  milestoneType: z.enum(types),
  occurredAt: z.string().datetime().or(z.string().min(1)),
  meta: z.record(z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bakeId = (await params).id;
  const bake = await prisma.bake.findFirst({
    where: { id: bakeId, userId: userId },
  });
  if (!bake) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    const milestone = await prisma.bakeMilestone.create({
      data: {
        bakeId,
        milestoneType: parsed.milestoneType,
        occurredAt: new Date(parsed.occurredAt),
        meta: (parsed.meta ?? undefined) as Prisma.InputJsonObject | undefined,
        notes: parsed.notes ?? undefined,
      },
    });
    return NextResponse.json(milestone);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
