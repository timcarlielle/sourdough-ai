import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;

  const log = await prisma.voiceLog.findFirst({
    where: { id, userId: userId },
    include: { bake: { select: { id: true, startedAt: true, recipe: { select: { title: true } } } } },
  });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(log);
}
