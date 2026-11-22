import { z } from "zod";
import { db } from "@/lib/db";
import { adminLogs } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { invalidateContext } from "@/lib/fares/browser";
import { deleteSession, readSession } from "@/lib/fares/sessions/store";
import { probeOlaSession } from "@/lib/fares/providers/ola";
import { PROVIDER_IDS } from "@/lib/fares/types";

/** Disconnect a provider, or probe whether its session is still alive. */

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ provider: string }>;
}

const providerSchema = z.enum(PROVIDER_IDS);

export async function DELETE(request: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    const session = await requireAdmin();

    const { provider: raw } = await ctx.params;
    const parsed = providerSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "Unknown provider" }, { status: 404 });
    }
    const provider = parsed.data;

    await deleteSession(provider);
    await invalidateContext(provider);

    await db.insert(adminLogs).values({
      adminId: session.user.id,
      action: "DISCONNECT_PROVIDER",
      targetTable: "provider_session",
      targetId: provider,
    });

    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/connections/:provider DELETE]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function POST(request: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();

    const { provider: raw } = await ctx.params;
    const parsed = providerSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: "Unknown provider" }, { status: 404 });
    }
    const provider = parsed.data;

    if (provider === "rapido") {
      // Anonymous: there is nothing to probe.
      return Response.json({ provider, alive: true, note: "No session required" });
    }

    const stored = await readSession(provider);
    if (!stored) {
      return Response.json({ provider, alive: false, note: "Not connected" });
    }

    if (provider === "ola") {
      const alive = await probeOlaSession(
        stored.plaintext.storageState,
        stored.plaintext.userAgent,
      );
      return Response.json({ provider, alive });
    }

    // There is no cheap probe for Uber: its GraphQL rejects a bare HTTP
    // client even with a valid session, so it cannot tell "dead" from "not a
    // page". Using it as a probe produces constant false alarms.
    return Response.json({
      provider,
      alive: null,
      note: "Uber has no cheap probe; health comes from real fare fetches",
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/connections/:provider POST]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
