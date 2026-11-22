/**
 * The provider contract.
 *
 * Three platforms, three genuinely different transports: Uber needs a real
 * browser page because its GraphQL only answers from the PWA's own context,
 * Ola is plain HTTP with session cookies, and Rapido is an anonymous page
 * scrape. The abstraction sits at `fetchFares` and deliberately not below it.
 */

export const PROVIDER_IDS = ["uber", "ola", "rapido"] as const;
export type ProviderId = (typeof PROVIDER_IDS)[number];

export type Coord = {
  latitude: number;
  longitude: number;
  /** Full formatted address, e.g. "Indiranagar, Bengaluru, Karnataka, India". */
  address?: string;
  /**
   * Short locality name, e.g. "Indiranagar". Rapido's SEO fare URL needs this
   * and it cannot be recovered from the formatted address afterwards, so the
   * geocoder preserves it all the way through.
   */
  name?: string;
};

export type FareOption = {
  name: string;
  category: string | null;
  /** Representative price, corrected for the shared account's own perks. */
  price: number;
  /** What the connected account is actually quoted, when it differs. */
  accountPrice?: number | null;
  /** Why the two differ, e.g. "Promo applied to the connected account". */
  discountNote?: string | null;
  /** Extra qualification, e.g. Rapido's "Range ₹104–₹125". */
  priceNote?: string | null;
  currency: string;
  etaText: string | null;
  durationMin: number | null;
  capacity: number | null;
};

export type Provider = {
  id: ProviderId;
  label: string;
  /** False for Rapido, which is fully anonymous. */
  requiresSession: boolean;
  fetchFares(pickup: Coord, drop: Coord): Promise<FareOption[]>;
};

/**
 * The provider could not be reached because our session is missing or dead.
 * This is an operator problem: it raises the admin banner and opens the
 * breaker. Kept distinct from NoRidesError on purpose.
 */
export class SessionError extends Error {
  constructor(
    message: string,
    readonly code: "NO_SESSION" | "AUTH_EXPIRED",
    readonly provider: ProviderId,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

/**
 * The provider answered correctly and there is simply nothing bookable on this
 * route. A legitimate answer, not a failure — it must never open the breaker
 * or flag the session as unhealthy.
 */
export class NoRidesError extends Error {
  constructor(
    message: string,
    readonly provider: ProviderId,
  ) {
    super(message);
    this.name = "NoRidesError";
  }
}

/** Per-provider lifecycle, as surfaced to the admin dashboard. */
export type SessionStatus =
  | "connected"
  | "degraded"
  | "expired"
  | "disconnected"
  /** Rapido: nothing to connect, so it must never appear in "needs attention". */
  | "open";

/** How a provider's results reached the client, per the SSE protocol. */
export type ProviderState =
  | "queued"
  | "fetching"
  | "cached"
  | "fresh"
  | "stale"
  | "unavailable";

export type ProviderResult = {
  provider: ProviderId;
  state: ProviderState;
  options: FareOption[];
  /** Age of the served data in seconds, when it did not come fresh. */
  ageSec?: number;
  reason?: string;
  /** True when an operator has to reconnect this provider. */
  needsLogin?: boolean;
};
