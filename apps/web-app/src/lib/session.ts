import { createHash } from "crypto";
import { getToken } from "next-auth/jwt";
import type { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

/** SHA-256 hash (hex) of a raw token — same at-rest scheme as device/voice tokens. */
export function apiTokenHash(rawToken: string): string {
  return createHash("sha256").update(rawToken, "utf8").digest("hex");
}

// Throttle lastUsedAt writes: at most one update per token per interval.
const LAST_USED_WRITE_INTERVAL_MS = 60 * 1000;
const lastUsedWrites = new Map<string, number>();

async function getUserIdFromBearer(req: Request): Promise<string | null> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  const rawToken = authHeader.slice(7).trim();
  if (!rawToken) return null;
  const hash = apiTokenHash(rawToken);
  const token = await prisma.apiToken.findFirst({
    where: { tokenHash: hash, revokedAt: null },
    select: { id: true, userId: true },
  });
  if (!token) return null;
  const now = Date.now();
  const lastWrite = lastUsedWrites.get(token.id) ?? 0;
  if (now - lastWrite > LAST_USED_WRITE_INTERVAL_MS) {
    lastUsedWrites.set(token.id, now);
    prisma.apiToken
      .update({ where: { id: token.id }, data: { lastUsedAt: new Date() } })
      .catch(() => {});
  }
  return token.userId;
}

/**
 * Resolve the authenticated user for an API route. Two paths:
 * 1. `Authorization: Bearer <personal access token>` — mobile app / scripts.
 * 2. NextAuth session cookie (JWT) — the web UI.
 * Returns the user id, or null when unauthenticated.
 */
export async function getSessionUserId(req: Request | NextRequest): Promise<string | null> {
  const bearerUserId = await getUserIdFromBearer(req);
  if (bearerUserId) return bearerUserId;

  // getToken accepts a fetch Request at runtime; its types only admit NextRequest.
  const token = await getToken({
    req: req as NextRequest,
    secret: process.env.NEXTAUTH_SECRET,
  });
  return (token?.id as string) ?? null;
}
