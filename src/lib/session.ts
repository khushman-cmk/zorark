import { cache } from "react";
import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

/**
 * Request-scoped session lookup.
 *
 * React's cache() dedupes this across the layout and the page, so the JWT
 * decode and its session-revocation check run once per request rather than
 * once per caller.
 */
export const getSession = cache(() => getServerSession(authOptions));

/** The name to greet the user by, falling back when there is no session. */
export async function getDisplayName(): Promise<string> {
  const session = await getSession();
  return session?.user?.name?.trim() || "Guest";
}

/** Just the first word of the display name, for the dashboard greeting. */
export async function getFirstName(): Promise<string> {
  const full = await getDisplayName();
  return full.split(/\s+/)[0] || full;
}
