import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getVoiceParseQueue } from "@/lib/dashboard-insights-queue";
import { getSessionUserId } from "@/lib/session";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;

  const log = await prisma.voiceLog.findFirst({
    where: { id, userId: userId },
    select: { id: true, status: true },
  });
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await prisma.voiceLog.update({
    where: { id },
    data: { status: "pending", error: null },
  });
  const queue = getVoiceParseQueue();
  await queue.add("parse", { voiceLogId: id }, { jobId: `voice-rerun-${id}` });
  return new NextResponse(null, { status: 202 });
}
