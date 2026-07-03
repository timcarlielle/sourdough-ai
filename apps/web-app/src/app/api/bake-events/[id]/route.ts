import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BAKE_EVENT_PHASES, getPhaseForEventType } from "@/lib/bake-events";
import type { BakeEventPhase, Prisma } from "@prisma/client";
import { getSessionUserId } from "@/lib/session";

const updateSchema = z.object({
  event_type: z.string().min(1).optional(),
  occurred_at: z.string().datetime().or(z.string().min(1)).optional(),
  event_phase: z.enum(BAKE_EVENT_PHASES as unknown as [string, ...string[]]).optional(),
  sequence_index: z.number().int().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const event = await prisma.bakeEvent.findFirst({
    where: { id, userId: userId },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await req.json();
    const data = updateSchema.parse(body);
    const eventPhase = (data.event_phase ??
      (data.event_type ? getPhaseForEventType(data.event_type) : undefined)) as BakeEventPhase | undefined;
    const updated = await prisma.bakeEvent.update({
      where: { id },
      data: {
        ...(data.event_type != null && { eventType: data.event_type }),
        ...(data.occurred_at != null && { occurredAt: new Date(data.occurred_at) }),
        ...(eventPhase != null && { eventPhase }),
        ...(data.sequence_index !== undefined && { sequenceIndex: data.sequence_index ?? undefined }),
        ...(data.metadata !== undefined && { metadata: (data.metadata ?? undefined) as Prisma.InputJsonObject | undefined }),
        ...(data.notes !== undefined && { notes: data.notes ?? undefined }),
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
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const event = await prisma.bakeEvent.findFirst({
    where: { id, userId: userId },
  });
  if (!event) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.bakeEvent.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
