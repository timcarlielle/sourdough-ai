import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyCredentials } from "@/lib/auth";
import { issueApiToken } from "@/lib/api-tokens";

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  // Device name shown in the account token list, e.g. "Tim's iPhone"
  name: z.string().min(1).max(100).optional(),
});

// In-memory rate limit: fine for a single-instance self-hosted server.
const WINDOW_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const attempts = new Map<string, { count: number; windowStart: number }>();

function rateLimited(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    attempts.set(key, { count: 1, windowStart: now });
    return false;
  }
  entry.count++;
  return entry.count > MAX_ATTEMPTS;
}

/**
 * POST /api/auth/mobile — email/password login for API clients (the mobile app).
 * Returns a long-lived personal access token (plaintext, once) plus the user profile.
 * Send it back as `Authorization: Bearer <token>` on any /api route.
 */
export async function POST(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (rateLimited(ip)) {
    return NextResponse.json({ error: "Too many attempts. Try again in a minute." }, { status: 429 });
  }

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const user = await verifyCredentials(body.email, body.password);
  if (!user) {
    return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  }

  const issued = await issueApiToken(user.id, body.name ?? "Mobile app");
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true, timezone: true },
  });

  return NextResponse.json({
    token: issued.token,
    tokenId: issued.id,
    user: profile,
  });
}
