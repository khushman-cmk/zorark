/**
 * One typed read of every knob this subsystem takes, so nothing else in the
 * tree reaches into process.env directly and the defaults live in one place.
 */

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(name: string, fallback: boolean): boolean {
  const raw = process.env[name]?.trim().toLowerCase();
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw === "true" || raw === "yes";
}

/**
 * Read through getters rather than captured at import time, so tests can
 * shrink the inter-request gap without the module-load order mattering.
 */
export const fareConfig = {
  /**
   * Serial execution gap. The single most important account-safety control:
   * humans do not issue two fare estimates a second, and bursts are the most
   * legible bot signal there is. Tests shrink it; production leaves it alone.
   */
  get gapMs() {
    return int("FARE_GAP_MS", 8_000);
  },
  get gapJitterMs() {
    return int("FARE_GAP_JITTER_MS", 2_000);
  },

  /** Token bucket: 20 requests per 10 minutes per provider, refilled smoothly. */
  get bucketSize() {
    return int("FARE_BUCKET_SIZE", 20);
  },
  get bucketWindowMs() {
    return int("FARE_BUCKET_WINDOW_MS", 10 * 60_000);
  },

  /** Daily ceiling per provider. On exhaustion we go cache-only and warn. */
  get dailyBudget() {
    return int("FARE_DAILY_BUDGET", 800);
  },

  /** Breaker: opens on this many auth failures, or this many plain errors. */
  get breakerAuthFailures() {
    return int("FARE_BREAKER_AUTH_FAILURES", 3);
  },
  get breakerErrors() {
    return int("FARE_BREAKER_ERRORS", 5);
  },
  /** Escalating cooldown, in minutes. */
  breakerCooldownsMin: [1, 5, 15, 60] as const,

  /** Past this queue depth we reject and serve stale instead of backlogging. */
  get maxQueueDepth() {
    return int("FARE_MAX_QUEUE_DEPTH", 8);
  },

  /** Cache bands. Ola's own `nextCallAfter: 30` is the floor for "fresh". */
  get freshMs() {
    return int("FARE_FRESH_MS", 90_000);
  },
  get staleMs() {
    return int("FARE_STALE_MS", 30 * 60_000);
  },

  /** ~111 m. Coarsening trades precision for hit rate. */
  get cacheGridDeg() {
    return Number(process.env.FARE_CACHE_GRID_DEG ?? "0.001");
  },

  /** Ring buffer depth for the payload console, per provider. */
  get payloadRingSize() {
    return int("FARE_PAYLOAD_RING_SIZE", 40);
  },

  /** Browser. Google ships no Chrome for linux-arm64, so this must be switchable. */
  get browserChannel() {
    return process.env.FARE_BROWSER_CHANNEL?.trim() || undefined;
  },
  get headful() {
    return bool("FARE_HEADFUL", false);
  },

  /** How long a provider may go without an auth signal before we probe it. */
  get probeAfterQuietMs() {
    return int("FARE_PROBE_AFTER_QUIET_MS", 10 * 60_000);
  },

  /** Per-page budget for the browser adapters. */
  get pageTimeoutMs() {
    return int("FARE_PAGE_TIMEOUT_MS", 45_000);
  },
  /** Extra listening window after a first GraphQL match, to catch the priced pass. */
  get settleMs() {
    return int("FARE_SETTLE_MS", 4_000);
  },
};

/** Base64 32-byte key for sealing provider sessions. Read lazily so that
 *  importing this module never throws at build time. */
export function sessionKey(): Buffer {
  const raw = process.env.FARE_SESSION_KEY?.trim();
  if (!raw) {
    throw new Error(
      "FARE_SESSION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `FARE_SESSION_KEY must decode to 32 bytes for AES-256-GCM, got ${key.length}.`,
    );
  }
  return key;
}

/** Bearer token the CLI helper presents when importing a captured session. */
export function connectToken(): string | null {
  return process.env.CONNECT_TOKEN?.trim() || null;
}
