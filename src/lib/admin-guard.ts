import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";

/**
 * Server-side admin role check (defense-in-depth — proxy alone is not enough).
 * Call this at the top of every /api/admin/* route handler.
 *
 * Returns the session if the caller is an admin.
 * Throws a Response with status 403 otherwise.
 */
export async function requireAdmin() {
  const session = await getServerSession(authOptions);

  if (!session || session.user?.role !== "admin") {
    throw new Response(JSON.stringify({ error: "Forbidden" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return session;
}

/**
 * Write a row to admin_logs.
 * Import `db` and `adminLogs` at call-site to avoid circular deps.
 */
export type AdminLogPayload = {
  adminId: string;
  action: string;
  targetTable?: string;
  targetId?: string;
  details?: Record<string, unknown>;
};
