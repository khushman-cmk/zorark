import { expect, test } from "@playwright/test";
import type { Coord, FareOption, Provider } from "@/lib/fares/types";
import { NoRidesError, SessionError } from "@/lib/fares/types";
import {
  admit,
  enqueue,
  queueDepth,
  resetQueues,
  spendDailyBudget,
} from "@/lib/fares/orchestrator/queue";
import {
  breakerSnapshot,
  isOpen,
  recordAuthFailure,
  recordError,
  recordSuccess,
  resetBreakers,
} from "@/lib/fares/orchestrator/breaker";
import {
  clearInflight,
  inflightCount,
  singleFlight,
} from "@/lib/fares/orchestrator/single-flight";
import { streamFares } from "@/lib/fares/orchestrator/stream";
import { routeKey } from "@/lib/fares/route-key";
import { db } from "@/lib/db";
import { fareCache } from "@/lib/schema";
import { eq } from "drizzle-orm";

/**
 * The orchestration layer, exercised against a fake provider that sleeps.
 *
 * No browser, no network, no session. This is where the account-safety
 * guarantees are actually proved: one call per route regardless of
 * concurrency, a human-plausible gap between calls, and a breaker that stops
 * us hammering a dead session into a ban.
 */

// The cache is a real table shared by every worker, so each one gets its own
// route. Without this, one worker's cache write lands between another's
// cleanup and its assertion, and the second sees "cached" where it expected
// "fresh".
const WORKER = Number(process.env.TEST_PARALLEL_INDEX ?? "0");
const OFFSET = WORKER * 0.05;

const PICKUP: Coord = {
  latitude: 12.9783692 + OFFSET,
  longitude: 77.6408356,
  address: "Indiranagar, Bengaluru, Karnataka, India",
  name: "Indiranagar",
};

const DROP: Coord = {
  latitude: 12.9352403 + OFFSET,
  longitude: 77.624532,
  address: "Koramangala, Bengaluru, Karnataka, India",
  name: "Koramangala",
};

type Calls = { n: number; at: number[] };

function fakeProvider(overrides: Partial<Provider> = {}): Provider & { calls: Calls } {
  const calls: Calls = { n: 0, at: [] };
  const base: Provider = {
    id: "rapido",
    label: "Fake",
    requiresSession: false,
    async fetchFares(): Promise<FareOption[]> {
      calls.n += 1;
      calls.at.push(Date.now());
      await new Promise((r) => setTimeout(r, 20));
      return [
        {
          name: "Auto",
          category: "auto",
          price: 104,
          currency: "INR",
          etaText: null,
          durationMin: null,
          capacity: null,
        },
      ];
    },
  };
  return Object.assign(base, overrides, { calls });
}

test.beforeEach(async () => {
  resetQueues();
  resetBreakers();
  clearInflight();
  process.env.FARE_GAP_MS = "40";
  process.env.FARE_GAP_JITTER_MS = "0";
  // The cache is a real table, so a previous test's write would otherwise be
  // served back as a hit and the next assertion would see "cached".
  await db.delete(fareCache).where(eq(fareCache.routeKey, routeKey(PICKUP, DROP)));
});

test.describe("single-flight", () => {
  test("twenty concurrent callers cost exactly one call", async () => {
    let calls = 0;
    const work = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 30));
      return "done";
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => singleFlight("rapido:route", work)),
    );

    // The whole point: N users on one route must be one request against the
    // shared account, not N.
    expect(calls).toBe(1);
    expect(results).toHaveLength(20);
    expect(new Set(results)).toEqual(new Set(["done"]));
    expect(inflightCount()).toBe(0);
  });

  test("different routes do not share a flight", async () => {
    let calls = 0;
    const work = async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 10));
      return calls;
    };
    await Promise.all([singleFlight("rapido:a", work), singleFlight("rapido:b", work)]);
    expect(calls).toBe(2);
  });

  test("a failed flight does not poison the next caller", async () => {
    await expect(
      singleFlight("rapido:x", async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");

    await expect(singleFlight("rapido:x", async () => "ok")).resolves.toBe("ok");
  });
});

test.describe("serial execution with a gap", () => {
  test("consecutive calls are separated by at least the configured gap", async () => {
    process.env.FARE_GAP_MS = "120";
    const at: number[] = [];
    const task = async () => {
      at.push(Date.now());
      return null;
    };

    await Promise.all([
      enqueue("rapido", task),
      enqueue("rapido", task),
      enqueue("rapido", task),
    ]);

    expect(at).toHaveLength(3);
    for (let i = 1; i < at.length; i++) {
      // Bursts are the most legible bot signal there is.
      expect(at[i] - at[i - 1]).toBeGreaterThanOrEqual(110);
    }
  });

  test("one failure does not wedge the lane", async () => {
    await expect(
      enqueue("rapido", async () => {
        throw new Error("nope");
      }),
    ).rejects.toThrow("nope");

    await expect(enqueue("rapido", async () => "after")).resolves.toBe("after");
    expect(queueDepth("rapido")).toBe(0);
  });
});

test.describe("circuit breaker", () => {
  test("opens after three auth failures, not before", () => {
    recordAuthFailure("uber");
    recordAuthFailure("uber");
    // Two transient 401s must not tear down a working provider.
    expect(isOpen("uber")).toBe(false);

    recordAuthFailure("uber");
    // Hammering a dead session with 401s is exactly what converts "expired"
    // into "banned".
    expect(isOpen("uber")).toBe(true);
    expect(breakerSnapshot("uber").retryAfterSec).toBeGreaterThan(0);
  });

  test("opens after five plain errors", () => {
    for (let i = 0; i < 4; i++) recordError("ola");
    expect(isOpen("ola")).toBe(false);
    recordError("ola");
    expect(isOpen("ola")).toBe(true);
  });

  test("cooldown escalates with each trip", () => {
    for (let i = 0; i < 3; i++) recordAuthFailure("uber");
    const first = breakerSnapshot("uber").retryAfterSec;

    recordSuccess("uber");
    for (let i = 0; i < 3; i++) recordAuthFailure("uber");
    const second = breakerSnapshot("uber").retryAfterSec;

    // A repeat offender waits longer: one minute, then five.
    expect(second).toBeGreaterThan(first);
  });

  test("success clears the counters", () => {
    recordAuthFailure("uber");
    recordAuthFailure("uber");
    recordSuccess("uber");
    recordAuthFailure("uber");
    expect(isOpen("uber")).toBe(false);
  });
});

test.describe("admission control", () => {
  test("an unconnected provider never enters the queue", async () => {
    const decision = await admit("uber", { requiresSession: true, hasSession: false });
    expect(decision.ok).toBe(false);
    if (!decision.ok) {
      expect(decision.needsLogin).toBe(true);
    }
    // It must not have spent a queue slot or a unit of the daily budget.
    expect(queueDepth("uber")).toBe(0);
  });

  test("an anonymous provider skips the session check entirely", async () => {
    const decision = await admit("rapido", { requiresSession: false, hasSession: false });
    expect(decision.ok).toBe(true);
  });

  test("an open breaker refuses admission with a retry hint", async () => {
    for (let i = 0; i < 3; i++) recordAuthFailure("uber");
    const decision = await admit("uber", { requiresSession: true, hasSession: true });
    expect(decision.ok).toBe(false);
    if (!decision.ok) expect(decision.retryAfterSec).toBeGreaterThan(0);
  });

  test("the token bucket refuses once drained", async () => {
    process.env.FARE_BUCKET_SIZE = "3";
    process.env.FARE_BUCKET_WINDOW_MS = "600000";
    resetQueues();

    const outcomes: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      outcomes.push(
        (await admit("rapido", { requiresSession: false, hasSession: true })).ok,
      );
    }
    expect(outcomes.slice(0, 3)).toEqual([true, true, true]);
    expect(outcomes.slice(3)).toEqual([false, false]);

    delete process.env.FARE_BUCKET_SIZE;
    delete process.env.FARE_BUCKET_WINDOW_MS;
  });
});

test.describe("daily budget", () => {
  test("stops granting once the ceiling is reached", async () => {
    process.env.FARE_DAILY_BUDGET = "0";
    // A zero ceiling means the conditional increment can never match.
    expect(await spendDailyBudget("rapido")).toBe(false);
    delete process.env.FARE_DAILY_BUDGET;
  });
});

test.describe("SSE protocol", () => {
  test("emits meta, then queued rows, then results, then done", async () => {
    const provider = fakeProvider();
    const events = [];
    for await (const event of streamFares(PICKUP, DROP, { providers: [provider] })) {
      events.push(event);
    }

    expect(events[0].type).toBe("meta");
    if (events[0].type === "meta") {
      expect(events[0].straightLineKm).toBeGreaterThan(4);
      expect(events[0].routeKey).toContain("|");
    }

    // Every provider announces itself before any work starts, so the UI can
    // render all its rows at once instead of popping them in one by one.
    expect(events[1].type).toBe("provider");
    if (events[1].type === "provider") expect(events[1].state).toBe("queued");

    expect(events[events.length - 1].type).toBe("done");

    const priced = events.filter(
      (e) => e.type === "provider" && e.state === "fresh" && e.options?.length,
    );
    expect(priced.length).toBeGreaterThan(0);
  });

  test("a provider with no session reports needsLogin and never calls out", async () => {
    const provider = fakeProvider({ id: "uber", label: "Uber", requiresSession: true });
    const events = [];
    for await (const event of streamFares(PICKUP, DROP, { providers: [provider] })) {
      events.push(event);
    }

    const failure = events.find(
      (e) => e.type === "provider" && (e.state === "unavailable" || e.state === "stale"),
    );
    expect(failure).toBeDefined();
    if (failure?.type === "provider") expect(failure.needsLogin).toBe(true);
    // The important part: it never reached the provider at all.
    expect(provider.calls.n).toBe(0);
  });

  test("no rides is a legitimate answer, not a breaker trip", async () => {
    const provider = fakeProvider({
      async fetchFares(): Promise<FareOption[]> {
        throw new NoRidesError("nothing bookable", "rapido");
      },
    });

    const events = [];
    for await (const event of streamFares(PICKUP, DROP, { providers: [provider] })) {
      events.push(event);
    }

    expect(isOpen("rapido")).toBe(false);
    const rows = events.filter((e) => e.type === "provider");
    const row = rows[rows.length - 1];
    if (row?.type === "provider") {
      expect(row.state).toBe("fresh");
      expect(row.options).toEqual([]);
    }
  });

  test("an expired session is reported without inventing prices", async () => {
    const provider = fakeProvider({
      id: "ola",
      label: "Ola",
      requiresSession: false,
      async fetchFares(): Promise<FareOption[]> {
        throw new SessionError("Ola session has expired", "AUTH_EXPIRED", "ola");
      },
    });

    const events = [];
    for await (const event of streamFares(PICKUP, DROP, { providers: [provider] })) {
      events.push(event);
    }

    const rows = events.filter(
      (e) => e.type === "provider" && e.state !== "queued" && e.state !== "fetching",
    );
    const row = rows[rows.length - 1];
    if (row?.type === "provider") {
      expect(row.needsLogin).toBe(true);
      expect(row.options ?? []).toEqual([]);
    }
  });
});
