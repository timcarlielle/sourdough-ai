import { NextResponse } from "next/server";
import { randomBytes, createHash } from "crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";

/** Must match ingest-api: SHA-256 hex of raw token. */
function tokenHash(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const device = await prisma.device.findFirst({
    where: { id: (await params).id, userId: userId },
  });
  if (!device) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const { tokenHash: _, ...rest } = device;
  return NextResponse.json(rest);
}

const patchSchema = z.object({
  name: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
  rotateToken: z.literal(true).optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const device = await prisma.device.findFirst({
    where: { id, userId: userId },
  });
  if (!device) return NextResponse.json({ error: "Not found" }, { status: 404 });
  try {
    const body = await req.json().catch(() => ({}));
    const data = patchSchema.parse(body);
    const updates: { name?: string; isActive?: boolean; tokenHash?: string } = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.isActive !== undefined) updates.isActive = data.isActive;
    let newToken: string | undefined;
    if (data.rotateToken) {
      newToken = randomBytes(32).toString("hex");
      updates.tokenHash = tokenHash(newToken);
    }
    const updated = await prisma.device.update({
      where: { id },
      data: updates,
    });
    const { tokenHash: _, ...rest } = updated;
    return NextResponse.json({ ...rest, token: newToken });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: e.flatten() }, { status: 400 });
    }
    return NextResponse.json({ error: "Update failed" }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = (await params).id;
  const device = await prisma.device.findFirst({
    where: { id, userId: userId },
  });
  if (!device) return NextResponse.json({ error: "Not found" }, { status: 404 });
  await prisma.device.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
