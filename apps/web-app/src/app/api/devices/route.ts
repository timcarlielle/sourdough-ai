import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

const createSchema = z.object({
  name: z.string().min(1),
  deviceType: z.enum(["starter_monitor", "dough_monitor"]),
});

export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const devices = await prisma.device.findMany({
    where: { userId: userId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(devices.map((d) => ({ ...d, tokenHash: undefined })));
}

export async function POST(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const { name, deviceType } = createSchema.parse(body);
    const rawToken = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    const device = await prisma.device.create({
      data: { userId, name, deviceType, tokenHash, isActive: true },
    });
    return NextResponse.json({
      ...device,
      tokenHash: undefined,
      token: rawToken,
      message: "Copy the token now; it will not be shown again.",
    });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Create failed" }, { status: 500 });
  }
}
