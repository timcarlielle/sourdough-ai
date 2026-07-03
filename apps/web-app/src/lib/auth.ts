import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

/**
 * Verify email/password against the users table. Shared by the NextAuth
 * credentials provider and the mobile token login endpoint (/api/auth/mobile).
 */
export async function verifyCredentials(
  email: string,
  password: string
): Promise<{ id: string; email: string } | null> {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !(await compare(password, user.passwordHash))) return null;
  return { id: user.id, email: user.email };
}

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        return verifyCredentials(credentials.email, credentials.password);
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.id = user.id;
        token.email = user.email ?? undefined;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
        session.user.email = token.email as string;
        const user = await prisma.user.findUnique({
          where: { id: token.id as string },
          select: { timezone: true },
        });
        session.user.timezone = user?.timezone ?? "America/Edmonton";
      }
      return session;
    },
  },
};
