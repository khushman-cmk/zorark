import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { rawPayloads, rideObservations } from "@/lib/schema";
import { requireAdmin } from "@/lib/admin-guard";
import { ensureDatabaseSetup } from "@/lib/db-init";
import { decodeBody, discoverFareCandidates, summarisePaths } from "@/lib/fares/payloads/discover";
import { normalizeUber } from "@/lib/fares/providers/uber.normalize";
import { normalizeOla } from "@/lib/fares/providers/ola.normalize";
import { normalizeRapido } from "@/lib/fares/providers/rapido.normalize";
import type { FareOption } from "@/lib/fares/types";

/**
 * One payload, in three views: raw, decoded, and what the *current* parser
 * makes of it.
 *
 * The third is the useful one. Re-running today's normalizer against a stored
 * body shows the effect of a parser change against real historical data
 * without refetching anything.
 */

export const runtime = "nodejs";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Replays the live normalizer over a stored body. */
function renormalize(provider: string, decoded: unknown): {
  options: FareOption[];
  error: string | null;
} {
  try {
    if (provider === "uber") {
      return { options: normalizeUber(decoded as never), error: null };
    }
    if (provider === "ola") {
      const body = decoded as { fares?: unknown; availability?: unknown };
      return {
        options: normalizeOla(body.fares as never, (body.availability ?? null) as never),
        error: null,
      };
    }
    if (provider === "rapido") {
      const body = decoded as { cards?: string[] };
      return { options: normalizeRapido(body.cards ?? []), error: null };
    }
    return { options: [], error: `No normalizer for ${provider}` };
  } catch (err) {
    return { options: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export async function GET(request: Request, ctx: RouteContext) {
  try {
    await ensureDatabaseSetup();
    await requireAdmin();

    const { id: rawId } = await ctx.params;
    const parsed = z.coerce.number().int().positive().safeParse(rawId);
    if (!parsed.success) {
      return Response.json({ error: "Invalid id" }, { status: 400 });
    }

    const [row] = await db
      .select()
      .from(rawPayloads)
      .where(eq(rawPayloads.id, parsed.data))
      .limit(1);

    if (!row) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    const decoded = decodeBody(row.body);

    // Ranked by how often a shape repeats: the per-ride price field is
    // almost always at the top, because there is one of them per ride.
    const candidates = discoverFareCandidates(decoded.value);
    const paths = summarisePaths(candidates).slice(0, 25);

    const replay = renormalize(row.provider, decoded.value);

    const rides = await db
      .select()
      .from(rideObservations)
      .where(eq(rideObservations.payloadId, row.id))
      .orderBy(desc(rideObservations.price));

    return Response.json({
      data: {
        id: row.id,
        provider: row.provider,
        capturedAt: row.capturedAt,
        routeKey: row.routeKey,
        status: row.status,
        parsedCount: row.parsedCount,
        parseError: row.parseError,
        bodyBytes: row.body.length,
        bodyKind: decoded.kind,
        raw: row.body.slice(0, 200_000),
        pretty:
          decoded.kind === "json"
            ? JSON.stringify(decoded.value, null, 2).slice(0, 200_000)
            : null,
        paths,
        // What today's parser produces from this body, for side-by-side
        // comparison with what it produced at capture time.
        replay: replay.options,
        replayError: replay.error,
        replayDiffers: replay.options.length !== (row.parsedCount ?? 0),
        rides,
      },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[admin/payloads/:id]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
