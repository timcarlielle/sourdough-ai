"use client";

import { useSession } from "next-auth/react";

const FALLBACK = "America/Edmonton";

/**
 * Returns the current user's timezone from session (set in Account).
 * Use with formatInUserTz(date, timezone) so times display correctly.
 */
export function useUserTimezone(): string {
  const { data: session } = useSession();
  return session?.user?.timezone ?? FALLBACK;
}
