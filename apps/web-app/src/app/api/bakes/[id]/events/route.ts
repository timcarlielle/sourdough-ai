import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { BAKE_EVENT_PHASES, getPhaseForEventType } from "@/lib/bake-events";
import type { BakeEventPhase, Prisma } from "@prisma/client";
import { getSessionUserId } from "@/lib/session";

const phases: [BakeEventPhase, ...BakeEventPhase[]] = [
  "mixing",
  "bulk_fermentation",
  "dividing",
  "shaping",
  "proofing",
  "baking",
  "cooling",
  "evaluation",
  "environment",
  "custom",
];

const createSchema = z.object({
  event_type: z.string().min(1),
  occurred_at: z.string().datetime().or(z.string().min(1)),
  event_phase: z.enum(BAKE_EVENT_PHASES as unknown as [string, ...string[]]).optional(),
  sequence_index: z.number().int().optional().nullable(),
  metadata: z.record(z.unknown()).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export async function GET(
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
  const events = await prisma.bakeEvent.findMany({
    where: { bakeId },
    orderBy: [{ occurredAt: "asc" }, { sequenceIndex: "asc" }],
  });
  return NextResponse.json(events);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const bakeId = (await params).id;
  const bake = await prisma.bake.findFirst({
    where: { id: bakeId, userId },
  });
  if (!bake) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await req.json();
    const parsed = createSchema.parse(body);
    let eventPhase = (parsed.event_phase ?? getPhaseForEventType(parsed.event_type)) as BakeEventPhase;
    if (eventPhase === "custom") {
      const custom = await prisma.customBakeEventType.findFirst({
        where: { userId, eventType: parsed.event_type },
        select: { phase: true },
      });
      if (custom) eventPhase = custom.phase;
    }
    const event = await prisma.bakeEvent.create({
      data: {
        bakeId,
        userId,
        eventType: parsed.event_type,
        occurredAt: new Date(parsed.occurred_at),
        eventPhase,
        sequenceIndex: parsed.sequence_index ?? undefined,
        metadata: (parsed.metadata ?? undefined) as Prisma.InputJsonObject | undefined,
        notes: parsed.notes ?? undefined,
      },
    });
    return NextResponse.json(event);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
