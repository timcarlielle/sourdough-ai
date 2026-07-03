import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSessionUserId } from "@/lib/session";
import { issueApiToken } from "@/lib/api-tokens";

/** GET /api/account/tokens — list the user's personal access tokens (no hashes). */
export async function GET(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const tokens = await prisma.apiToken.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, createdAt: true, lastUsedAt: true, revokedAt: true },
  });
  return NextResponse.json({ tokens });
}

const createSchema = z.object({ name: z.string().min(1).max(100) });

/** POST /api/account/tokens — create a token; the plaintext is returned once. */
export async function POST(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const issued = await issueApiToken(userId, body.name);
  return NextResponse.json(issued, { status: 201 });
}
