import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

/** GET /api/analytics/starter-models — list all starter models for user (active first). Debug only. */
export async function GET(req: Request) {
  if (!process.env.NEXT_PUBLIC_STARTER_DEBUG) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const models = await prisma.starterModel.findMany({
    where: { userId },
    orderBy: [{ isActive: "desc" }, { updatedAt: "desc" }],
    select: {
      id: true,
      name: true,
      isActive: true,
      isLocked: true,
      modelType: true,
      paramA: true,
      paramK: true,
      paramB: true,
      sigmaBaseMinutes: true,
      trainedOnCycles: true,
      lastTrainedAt: true,
      meta: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({ models });
}
