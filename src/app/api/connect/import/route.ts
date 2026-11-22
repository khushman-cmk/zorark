import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { connectToken } from "@/lib/fares/config";
import { DEVICE_PROFILE_ID } from "@/lib/fares/device";
import { invalidateContext } from "@/lib/fares/browser";
import { looksLikeStorageState } from "@/lib/fares/sessions/crypto";
import { writeSession } from "@/lib/fares/sessions/store";
import { PROVIDER_IDS } from "@/lib/fares/types";
import { ensureDatabaseSetup } from "@/lib/db-init";

/**
 * Session import for the operator's CLI helper.
 *
 * Deliberately outside `/api/admin/*`: the proxy 403s unauthenticated
 * requests there, so a CLI with no cookie could never reach it. Guarded
 * instead by a bearer token compared in constant time, and rate limited.
 *
 * The known weakness of this path is that the session is minted on the
 * operator's residential IP and then replayed from the server. That
 * IP-family switch is exactly what fraud systems watch for, which is the
 * argument for the in-browser remote login.
 */

export const runtime = "nodejs";

const bodySchema = z.object({
  provider: z.enum(PROVIDER_IDS),
  // Accept either a bare storageState or a wrapper around one.
  storageState: z.unknown(),
  authHeaders: z.record(z.string(), z.string()).optional(),
  // The exact user agent of the browser that logged in, replayed verbatim on
  // the HTTP path so cookies are never sent under a different identity.
  userAgent: z.string().max(500).optional(),
});

// Five attempts per five minutes, per source. A wrong token should be
// expensive to guess even if the endpoint is discovered.
const attempts = new Map<string, { count: number; resetAt: number }>();
const WINDOW_MS = 5 * 60_000;
const MAX_ATTEMPTS = 5;

function throttled(key: string): boolean {
  const now = Date.now();
  const entry = attempts.get(key);
  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  entry.count += 1;
  return entry.count > MAX_ATTEMPTS;
}

function authorised(request: Request): boolean {
  const expected = connectToken();
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const presented = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (presented.length === 0) return false;

  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: Request) {
  try {
    await ensureDatabaseSetup();

    const source =
      request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    if (throttled(source)) {
      return Response.json({ error: "Too many attempts" }, { status: 429 });
    }

    if (!authorised(request)) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return Response.json({ error: "Invalid body" }, { status: 400 });
    }

    // Unwrap a nested { storageState: { storageState: ... } } if the operator
    // pasted the whole capture rather than just the state.
    const raw = parsed.data.storageState as Record<string, unknown> | null;
    const state =
      raw && !looksLikeStorageState(raw) && looksLikeStorageState(raw.storageState)
        ? raw.storageState
        : raw;

    if (!looksLikeStorageState(state)) {
      return Response.json(
        { error: "That does not look like a storageState: expected a cookies array" },
        { status: 400 },
      );
    }

    await writeSession(parsed.data.provider, {
      storageState: state,
      authHeaders: parsed.data.authHeaders,
      userAgent: parsed.data.userAgent,
      deviceProfileId: DEVICE_PROFILE_ID,
    });

    // Any pooled context still holds the old cookie jar.
    await invalidateContext(parsed.data.provider);

    const cookieCount = Array.isArray((state as { cookies?: unknown[] }).cookies)
      ? (state as { cookies: unknown[] }).cookies.length
      : 0;

    return Response.json({
      ok: true,
      provider: parsed.data.provider,
      cookies: cookieCount,
      deviceProfileId: DEVICE_PROFILE_ID,
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("[connect/import]", err);
    return Response.json({ error: "Import failed" }, { status: 500 });
  }
}
