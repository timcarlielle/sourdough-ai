import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { getSessionUserId } from "@/lib/session";

const UPLOAD_DIR = process.env.UPLOAD_DIR || "./uploads";

export async function POST(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return NextResponse.json({ error: "User not found; please sign in again." }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get("audio") as File | null;
  const bakeId = (formData.get("bakeId") as string) || undefined;
  if (!file || !file.size) return NextResponse.json({ error: "No audio file" }, { status: 400 });

  await mkdir(UPLOAD_DIR, { recursive: true });
  const ext = file.name.split(".").pop() || "webm";
  const filename = `${userId}-${Date.now()}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);
  const buf = Buffer.from(await file.arrayBuffer());
  await writeFile(filepath, buf);

  const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
  const audioUrl = `${baseUrl}/api/voice/file/${filename}`;

  const clip = await prisma.voiceClip.create({
    data: {
      userId,
      audioUrl,
      status: "uploaded",
    },
  });

  const { getVoiceQueue } = await import("@/lib/voice-queue");
  try {
    await getVoiceQueue().add("process", {
      voiceClipId: clip.id,
      userId,
      bakeId: bakeId || null,
    });
  } catch {
    // Redis/worker offline; clip stays uploaded, can retry later
  }

  return NextResponse.json({ id: clip.id, status: clip.status });
}
