import { request as pwRequest, type APIRequestContext } from "playwright";
import { readSession } from "../sessions/store";
import { recordPayload } from "../payloads/record";
import { routeKey } from "../route-key";
import {
  NoRidesError,
  SessionError,
  type Coord,
  type FareOption,
  type Provider,
} from "../types";
import {
  looksUnauthenticated,
  normalizeOla,
  type OlaAvailabilityResponse,
  type OlaFareResponse,
} from "./ola.normalize";

/**
 * Ola — plain HTTP with session cookies.
 *
 * The endpoint everyone reaches for, web-api/products, returns
 * 401 IDENTITY_MISSING even with a fully valid logged-in session. It was
 * verified failing three ways: bare HTTP client, Playwright request context,
 * and fetch() executed inside the logged-in page itself.
 *
 * The real fare source is two data-api endpoints, joined on category id.
 * Session cookies alone are sufficient; no identity header, no signature.
 */

const BASE = "https://book.olacabs.com";

function query(pickup: Coord, drop: Coord): string {
  const params = new URLSearchParams({
    pickupLat: String(pickup.latitude),
    pickupLng: String(pickup.longitude),
    pickupMode: "NOW",
    leadSource: "mobile_website",
    dropLat: String(drop.latitude),
    dropLng: String(drop.longitude),
    silent: "false",
  });
  return params.toString();
}

/**
 * A desktop Chrome user agent, used only when a stored session predates user
 * agent capture. Replaying the real one is always preferred: cookies minted
 * by one browser identity being sent under another is exactly the kind of
 * inconsistency that gets a session challenged.
 */
const FALLBACK_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36";

async function newContext(
  storageState: unknown,
  userAgent?: string,
): Promise<APIRequestContext> {
  return pwRequest.newContext({
    baseURL: BASE,
    userAgent: userAgent || FALLBACK_UA,
    extraHTTPHeaders: {
      // Not required — both were tested as unnecessary — but it costs nothing
      // and matches what the real client sends.
      "x-requested-with": "XMLHttpRequest",
      referer: `${BASE}/`,
    },
    storageState: storageState as never,
  });
}

/** The cheap Ola health probe: 601 NOT_LOGGED_IN is the dead signal. */
export async function probeOlaSession(
  storageState: unknown,
  userAgent?: string,
): Promise<boolean> {
  const ctx = await newContext(storageState, userAgent);
  try {
    const res = await ctx.get("/pwa-api/profile");
    const body = await res.text();
    return res.ok() && !looksUnauthenticated(res.status(), body);
  } finally {
    await ctx.dispose();
  }
}

export const olaProvider: Provider = {
  id: "ola",
  label: "Ola",
  requiresSession: true,

  async fetchFares(pickup: Coord, drop: Coord): Promise<FareOption[]> {
    const stored = await readSession("ola");
    if (!stored) {
      throw new SessionError("Ola is not connected", "NO_SESSION", "ola");
    }

    const ctx = await newContext(
      stored.plaintext.storageState,
      stored.plaintext.userAgent,
    );
    try {
      const qs = query(pickup, drop);
      const [fareRes, availRes] = await Promise.all([
        ctx.get(`/data-api/category-fare/p2p?${qs}&suggestPickup=true`),
        ctx.get(`/data-api/category-availability/p2p?${qs}`),
      ]);

      const fareBody = await fareRes.text();
      if (looksUnauthenticated(fareRes.status(), fareBody)) {
        throw new SessionError("Ola session has expired", "AUTH_EXPIRED", "ola");
      }
      if (!fareRes.ok()) {
        throw new Error(`Ola category-fare returned ${fareRes.status()}`);
      }

      const fares = JSON.parse(fareBody) as OlaFareResponse;

      // Availability is decorative. A failure there must never fail a fare
      // that parsed correctly, so it degrades to a title-cased category id.
      let availability: OlaAvailabilityResponse | null = null;
      try {
        if (availRes.ok()) {
          availability = (await availRes.json()) as OlaAvailabilityResponse;
        }
      } catch {
        availability = null;
      }

      const options = normalizeOla(fares, availability);

      void recordPayload({
        provider: "ola",
        routeKey: routeKey(pickup, drop),
        status: String(fareRes.status()),
        body: { fares, availability },
        parsed: options,
        parseError:
          options.length === 0 ? "Fare response parsed to no categories" : null,
      });

      if (options.length === 0) {
        throw new NoRidesError("Ola listed no categories on this route", "ola");
      }
      return options;
    } finally {
      await ctx.dispose();
    }
  },
};
