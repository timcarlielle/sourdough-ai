import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getActiveStarterCycle } from "db";
import { getSessionUserId } from "@/lib/session";

/** GET /api/analytics/starter-cycles?limit=50 — list cycles for selector + activeCycleId. Debug only. */
export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_STARTER_DEBUG) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const limit = Math.min(100, parseInt(new URL(req.url).searchParams.get("limit") ?? "50", 10) || 50);

  const [cycles, active] = await Promise.all([
    prisma.starterCycle.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: limit,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        status: true,
        sourceFeedingId: true,
      },
    }),
    getActiveStarterCycle(prisma, userId),
  ]);

  return NextResponse.json({ cycles, activeCycleId: active?.id ?? null });
}
