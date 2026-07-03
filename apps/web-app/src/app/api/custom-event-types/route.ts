import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { BakeEventPhase } from "@prisma/client";
import { z } from "zod";
import { BAKE_EVENT_PHASES } from "@/lib/bake-events";
import { getSessionUserId } from "@/lib/session";

const postBody = z.object({
  eventType: z.string().min(1).max(80).regex(/^[a-z][a-z0-9_]*$/, "slug: lowercase letters, numbers, underscores"),
  label: z.string().min(1).max(120),
  phase: z.enum(BAKE_EVENT_PHASES as unknown as [string, ...string[]]),
  sortOrder: z.number().int().optional(),
});

/** GET: list custom event types (also available via GET /api/bake-settings). */
export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const list = await prisma.customBakeEventType.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true, eventType: true, label: true, phase: true, sortOrder: true },
  });
  return NextResponse.json(list);
}

/** POST: create a custom bake event type (e.g. steam). LLM can use it when parsing recipes. */
export async function POST(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof postBody>;
  try {
    body = postBody.parse(await req.json());
  } catch (e) {
    return NextResponse.json({ error: "Invalid body", details: e }, { status: 400 });
  }

  const created = await prisma.customBakeEventType.create({
    data: {
      userId,
      eventType: body.eventType,
      label: body.label,
      phase: body.phase as BakeEventPhase,
      sortOrder: body.sortOrder ?? 0,
    },
    select: { id: true, eventType: true, label: true, phase: true, sortOrder: true },
  });
  return NextResponse.json(created);
}
