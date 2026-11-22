import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rawPayloads, rideObservations } from "@/lib/schema";
import { fareConfig } from "../config";
import type { FareOption, ProviderId } from "../types";

/**
 * Payload archive.
 *
 * These are undocumented APIs that change without notice. Keeping every
 * response, success and failure, is what turns a breakage into a five-minute
 * fix instead of a fresh reverse-engineering session.
 *
 * Recording must never break a fare request, so every entry point here
 * swallows its own errors.
 */

export type RecordInput = {
  provider: ProviderId;
  routeKey?: string | null;
  status?: string | null;
  body: unknown;
  parsed?: FareOption[] | null;
  parseError?: string | null;
};

/** Bodies can be large; keep the archive from becoming the biggest table. */
const MAX_BODY_CHARS = 400_000;

function serialise(body: unknown): string {
  if (typeof body === "string") return body.slice(0, MAX_BODY_CHARS);
  try {
    return JSON.stringify(body).slice(0, MAX_BODY_CHARS);
  } catch {
    return String(body).slice(0, MAX_BODY_CHARS);
  }
}

export async function recordPayload(input: RecordInput): Promise<number | null> {
  try {
    const [row] = await db
      .insert(rawPayloads)
      .values({
        provider: input.provider,
        routeKey: input.routeKey ?? null,
        status: input.status ?? null,
        parsedCount: input.parsed?.length ?? null,
        parseError: input.parseError ?? null,
        body: serialise(input.body),
      })
      .returning({ id: rawPayloads.id });

    if (!row) return null;

    // Ride observations go in alongside the payload, so the console can pivot
    // from "blobs" to "rides" — price history, cross-provider comparison at a
    // timestamp, and the earliest possible warning that a parser broke.
    if (input.parsed && input.parsed.length > 0) {
      await db.insert(rideObservations).values(
        input.parsed.map((option) => ({
          payloadId: row.id,
          provider: input.provider,
          routeKey: input.routeKey ?? null,
          rideName: option.name,
          category: option.category,
          price: String(option.price),
          priceLow: rangeLow(option),
          priceHigh: rangeHigh(option),
          etaMin: option.durationMin,
          currency: option.currency,
        })),
      );
    }

    await trimRing(input.provider);
    return row.id;
  } catch (err) {
    // Deliberately swallowed: the archive is a debugging aid, never a
    // dependency of answering a fare query.
    console.error("[payloads/record]", err);
    return null;
  }
}

/** Rapido quotes ranges; the note carries them, so pull them back out. */
function rangeLow(option: FareOption): string | null {
  const match = option.priceNote?.match(/₹([\d,]+)/);
  return match ? match[1].replace(/,/g, "") : null;
}

function rangeHigh(option: FareOption): string | null {
  const matches = option.priceNote?.match(/₹([\d,]+)/g);
  if (!matches || matches.length < 2) return null;
  return matches[1].replace(/[₹,]/g, "");
}

/** Capped ring buffer per provider, trimmed on insert. */
async function trimRing(provider: ProviderId): Promise<void> {
  await db.execute(sql`
    DELETE FROM raw_payload
    WHERE provider = ${provider}
      AND id NOT IN (
        SELECT id FROM raw_payload
        WHERE provider = ${provider}
        ORDER BY captured_at DESC
        LIMIT ${fareConfig.payloadRingSize}
      )
  `);
}

/**
 * Wraps a provider fetch so the payload is archived either way.
 *
 * `capture` hands back the raw body the adapter saw, so the console shows
 * what the provider actually said rather than what we made of it.
 */
export async function withRecording<T extends FareOption[]>(
  provider: ProviderId,
  routeKey: string | null,
  fn: () => Promise<{ options: T; raw: unknown; status?: string }>,
): Promise<T> {
  try {
    const { options, raw, status } = await fn();
    void recordPayload({
      provider,
      routeKey,
      status: status ?? "ok",
      body: raw,
      parsed: options,
    });
    return options;
  } catch (err) {
    void recordPayload({
      provider,
      routeKey,
      status: "error",
      body: (err as { raw?: unknown })?.raw ?? String(err),
      parseError: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}
