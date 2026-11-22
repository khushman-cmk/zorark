import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { rateLedger } from "@/lib/schema";
import { fareConfig } from "../config";
import type { ProviderId } from "../types";
import { isOpen, openReason, retryAfterSec } from "./breaker";

/**
 * The account-safety boundary.
 *
 * One account answers every visitor's query, so a single account issuing
 * hundreds of estimates a day is a detectable anomaly. Four independent
 * brakes sit here, each catching a different failure, plus admission control
 * so a backlog never builds.
 */

export type AdmissionDenial = {
  ok: false;
  reason: string;
  /** True when an operator has to do something about it. */
  needsLogin?: boolean;
  retryAfterSec?: number;
};

export type Admission = { ok: true } | AdmissionDenial;

// ── Brake 2: token bucket, refilled continuously ──────────────────────────
type Bucket = { tokens: number; lastRefill: number };
const buckets = new Map<ProviderId, Bucket>();

function bucket(provider: ProviderId): Bucket {
  let b = buckets.get(provider);
  if (!b) {
    b = { tokens: fareConfig.bucketSize, lastRefill: Date.now() };
    buckets.set(provider, b);
  }
  return b;
}

function refill(b: Bucket): void {
  const now = Date.now();
  const elapsed = now - b.lastRefill;
  if (elapsed <= 0) return;
  const perMs = fareConfig.bucketSize / fareConfig.bucketWindowMs;
  b.tokens = Math.min(fareConfig.bucketSize, b.tokens + elapsed * perMs);
  b.lastRefill = now;
}

function tryTake(provider: ProviderId): boolean {
  const b = bucket(provider);
  refill(b);
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

// ── Brake 3: daily budget, persisted so a restart cannot reset it ─────────
function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function spendDailyBudget(provider: ProviderId): Promise<boolean> {
  const day = today();
  // One statement: increment, but only while under the ceiling. If nothing
  // comes back the budget is exhausted.
  const result = await db.execute(sql`
    INSERT INTO rate_ledger (provider, day, count)
    VALUES (${provider}, ${day}, 1)
    ON CONFLICT (provider, day) DO UPDATE
      SET count = rate_ledger.count + 1
      WHERE rate_ledger.count < ${fareConfig.dailyBudget}
    RETURNING count
  `);
  return (result.rowCount ?? 0) > 0;
}

export async function budgetUsed(provider: ProviderId): Promise<number> {
  const [row] = await db
    .select()
    .from(rateLedger)
    .where(sql`${rateLedger.provider} = ${provider} AND ${rateLedger.day} = ${today()}`)
    .limit(1);
  return row?.count ?? 0;
}

// ── Brake 1: serial execution with a gap, per provider ────────────────────
type Lane = { chain: Promise<unknown>; depth: number; lastStart: number };
const lanes = new Map<ProviderId, Lane>();

function lane(provider: ProviderId): Lane {
  let l = lanes.get(provider);
  if (!l) {
    l = { chain: Promise.resolve(), depth: 0, lastStart: 0 };
    lanes.set(provider, l);
  }
  return l;
}

export function queueDepth(provider: ProviderId): number {
  return lane(provider).depth;
}

function nextGapMs(): number {
  // Jittered, because a metronome is its own signature.
  const jitter = (Math.random() * 2 - 1) * fareConfig.gapJitterMs;
  return Math.max(0, fareConfig.gapMs + jitter);
}

/**
 * Decides whether a request may enter the queue at all.
 *
 * Checked before enqueueing on purpose: an unconnected provider must not
 * consume a queue slot or a unit of the daily budget doing nothing.
 */
export async function admit(
  provider: ProviderId,
  opts: { requiresSession: boolean; hasSession: boolean },
): Promise<Admission> {
  if (opts.requiresSession && !opts.hasSession) {
    return { ok: false, reason: "Not connected", needsLogin: true };
  }

  if (isOpen(provider)) {
    return {
      ok: false,
      reason: openReason(provider) ?? "Temporarily paused",
      retryAfterSec: retryAfterSec(provider),
    };
  }

  // A four-minute backlog is worse than no answer, and it keeps the shared
  // account under sustained load.
  if (queueDepth(provider) >= fareConfig.maxQueueDepth) {
    return { ok: false, reason: "Busy, showing the last known prices" };
  }

  if (!tryTake(provider)) {
    return { ok: false, reason: "Rate limited, showing the last known prices" };
  }

  if (!(await spendDailyBudget(provider))) {
    return { ok: false, reason: "Daily quota reached, showing the last known prices" };
  }

  return { ok: true };
}

/**
 * Runs work serially per provider with a human-plausible gap between calls.
 * This is the single most important control: humans do not issue two
 * estimates a second, and bursts are the most legible bot signal there is.
 */
export function enqueue<T>(provider: ProviderId, fn: () => Promise<T>): Promise<T> {
  const l = lane(provider);
  l.depth += 1;

  const run = l.chain.then(async () => {
    const since = Date.now() - l.lastStart;
    const gap = nextGapMs();
    if (l.lastStart > 0 && since < gap) {
      await new Promise((r) => setTimeout(r, gap - since));
    }
    l.lastStart = Date.now();
    return fn();
  });

  // The lane advances whether the work succeeded or not, or one failure
  // would wedge the provider permanently.
  l.chain = run.then(
    () => undefined,
    () => undefined,
  );
  // Two-arg then, not .finally(): finally on a rejected promise returns a new
  // rejected promise, and nothing is there to catch it.
  const release = () => {
    l.depth -= 1;
  };
  run.then(release, release);

  return run;
}

/** Test seam. */
export function resetQueues(): void {
  lanes.clear();
  buckets.clear();
}
