"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import type { ReactNode } from "react";

/**
 * Client boundary for next-auth's SessionProvider.
 *
 * next-auth v4 ships SessionProvider without a "use client" directive, so a
 * server component cannot render it directly. This mirrors the wrapper the
 * admin area already uses in _components/AdminProviders.tsx.
 */
export function HomeProviders({
  children,
  session,
}: {
  children: ReactNode;
  session: Session | null;
}) {
  return <SessionProvider session={session}>{children}</SessionProvider>;
}
