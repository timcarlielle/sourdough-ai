import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const logs = await prisma.voiceLog.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      source: true,
      recordedAt: true,
      receivedAt: true,
      text: true,
      status: true,
      error: true,
      bakeId: true,
      createdAt: true,
    },
  });
  return NextResponse.json(logs);
}
