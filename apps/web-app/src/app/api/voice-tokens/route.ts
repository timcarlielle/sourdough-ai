import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { createHash, randomBytes } from "crypto";
import { getSessionUserId } from "@/lib/session";

function tokenHash(raw: string): string {
  return createHash("sha256").update(raw, "utf8").digest("hex");
}

/** POST: create a new voice token (for Siri / ingest). Returns the raw token once; store it securely. */
export async function POST(req: Request) {
  const userId = await getSessionUserId(req);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let body: { name?: string } = {};
  try {
    body = await req.json();
  } catch {
    //
  }
  const name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : "Siri";

  const rawToken = randomBytes(32).toString("hex");
  const hash = tokenHash(rawToken);

  await prisma.voiceToken.create({
    data: { userId, tokenHash: hash, name },
  });

  return NextResponse.json({
    token: rawToken,
    name,
    message: "Store this token securely. It will not be shown again. Use as Authorization: Bearer <token> for POST /ingest/voice.",
  });
}
