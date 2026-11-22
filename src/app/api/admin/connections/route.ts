import { db } from "@/lib/db";
import { adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { breakerSnapshot } from "@/lib/fares/orchestrator/breaker";
import { budgetUsed, queueDepth } from "@/lib/fares/orchestrator/queue";
import { readAllStatuses } from "@/lib/fares/sessions/store";
import { providers } from "@/lib/fares/providers";
import { fareConfig } from "@/lib/fares/config";
import type { SessionStatus } from "@/lib/fares/types";

/**
 * Connection status for every provider, for the admin dashboard.
 */

export const runtime = "nodejs";

export async function GET() {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();

    const stored = await readAllStatuses();
    const byProvider = new Map(stored.map((s) => [s.provider, s]));

    const data = await Promise.all(
      providers.map(async (provider) => {
        const record = byProvider.get(provider.id) ?? null;

        // Rapido has nothing to connect, so it reports a distinct status and
        // must never appear in "needs attention".
        const status: SessionStatus = provider.requiresSession
          ? (record?.status ?? "disconnected")
          : "open";

        return {
          provider: provider.id,
          label: provider.label,
          requiresSession: provider.requiresSession,
          status,
          needsAttention:
            provider.requiresSession &&
            (status === "expired" || status === "disconnected"),
          failStreak: record?.failStreak ?? 0,
          capturedAt: record?.capturedAt ?? null,
          refreshedAt: record?.refreshedAt ?? null,
          lastOkAt: record?.lastOkAt ?? null,
          lastFailAt: record?.lastFailAt ?? null,
          deviceProfileId: record?.deviceProfileId ?? null,
          profileMismatch: record?.profileMismatch ?? false,
          breaker: breakerSnapshot(provider.id),
          queueDepth: queueDepth(provider.id),
          budgetUsed: await budgetUsed(provider.id),
          dailyBudget: fareConfig.dailyBudget,
        };
      }),
    );

    return Response.json({ data });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/connections]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Records that an operator looked at the connection panel. */
export async function POST() {
  try {
    await ensureDatabaseSetup();
    const session = await requireAdmin();
    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "VIEW_PROVIDER_CONNECTIONS",
      targetTable: "provider_session",
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
