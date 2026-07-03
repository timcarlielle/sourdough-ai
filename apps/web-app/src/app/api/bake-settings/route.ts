import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { BAKE_EVENT_PHASES, type BakeEventPhase } from "@/lib/bake-events";
import { getSessionUserId } from "@/lib/session";

const patchBody = z.object({
  trackedPhases: z.array(z.enum(BAKE_EVENT_PHASES as unknown as [string, ...string[]])).nullable().optional(),
});

/** GET: return user's bake timeline settings (tracked phases + custom event types). */
export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [user, customEventTypes] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { trackedBakePhases: true },
    }),
    prisma.customBakeEventType.findMany({
      where: { userId },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, eventType: true, label: true, phase: true, sortOrder: true },
    }),
  ]);

  const trackedPhases = user?.trackedBakePhases as BakeEventPhase[] | null ?? null;
  return NextResponse.json({
    trackedPhases,
    customEventTypes: customEventTypes.map((t) => ({
      id: t.id,
      eventType: t.eventType,
      label: t.label,
      phase: t.phase,
      sortOrder: t.sortOrder,
    })),
  });
}

/** PATCH: update tracked bake phases (which phases show in timeline). null = track all. */
export async function PATCH(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: z.infer<typeof patchBody>;
  try {
    body = patchBody.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (body.trackedPhases === undefined) {
    return NextResponse.json({ error: "trackedPhases required" }, { status: 400 });
  }

  await prisma.user.update({
    where: { id: userId },
    data: { trackedBakePhases: body.trackedPhases === null ? Prisma.JsonNull : body.trackedPhases },
  });
  return NextResponse.json({ trackedPhases: body.trackedPhases });
}
