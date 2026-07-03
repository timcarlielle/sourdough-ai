import { randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { apiTokenHash } from "@/lib/session";

export type IssuedToken = {
  /** Plaintext token — shown once, never stored. */
  token: string;
  id: string;
  name: string;
  createdAt: Date;
};

/** Create a personal access token for a user; returns the plaintext token once. */
export async function issueApiToken(userId: string, name: string): Promise<IssuedToken> {
  const token = randomBytes(32).toString("hex");
  const created = await prisma.apiToken.create({
    data: { userId, name, tokenHash: apiTokenHash(token) },
    select: { id: true, name: true, createdAt: true },
  });
  return { token, ...created };
}
