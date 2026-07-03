import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { BakeEventPhase } from "@prisma/client";
import { z } from "zod";
import { BAKE_EVENT_PHASES } from "@/lib/bake-events";
import { getSessionUserId } from "@/lib/session";

const patchBody = z.object({
  label: z.string().min(1).max(120).optional(),
  phase: z.enum(BAKE_EVENT_PHASES as unknown as [string, ...string[]]).optional(),
  sortOrder: z.number().int().optional(),
});

/** PATCH: update custom event type. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;

  let body: z.infer<typeof patchBody>;
  try {
    body = patchBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const existing = await prisma.customBakeEventType.findFirst({
    where: { id, userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const updated = await prisma.customBakeEventType.update({
    where: { id },
    data: {
      ...(body.label != null && { label: body.label }),
      ...(body.phase != null && { phase: body.phase as BakeEventPhase }),
      ...(body.sortOrder != null && { sortOrder: body.sortOrder }),
    },
    select: { id: true, eventType: true, label: true, phase: true, sortOrder: true },
  });
  return NextResponse.json(updated);
}

/** DELETE: remove custom event type. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(_req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;

  const existing = await prisma.customBakeEventType.findFirst({
    where: { id, userId },
  });
  if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.customBakeEventType.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
