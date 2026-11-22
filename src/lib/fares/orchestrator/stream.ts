import { fareConfig } from "../config";
import { providers as allProviders } from "../providers";
import { routeKey as makeRouteKey, straightLineKm } from "../route-key";
import { markAuthFailure, markSuccess, readStatus } from "../sessions/store";
import {
  NoRidesError,
  SessionError,
  type Coord,
  type FareOption,
  type Provider,
  type ProviderId,
  type ProviderState,
} from "../types";
import { recordAuthFailure, recordError, recordSuccess } from "./breaker";
import { readCache, writeCache } from "./cache";
import { admit, enqueue } from "./queue";
import { singleFlight } from "./single-flight";

/**
 * Fare orchestration as an async generator.
 *
 * Deliberately not a set of per-provider Suspense boundaries: those hold the
 * response open for the whole duration, give exactly one state transition per
 * provider (so no "queued, third in line"), cannot push a later update — which
 * kills the stale-then-refresh flow the cache exists to produce — and have no
 * reconnection story. A generator keeps the protocol testable with no HTTP.
 */

export type FareEvent =
  | { type: "meta"; straightLineKm: number; routeKey: string; providers: ProviderId[] }
  | {
      type: "provider";
      provider: ProviderId;
      label: string;
      state: ProviderState;
      options?: FareOption[];
      ageSec?: number;
      reason?: string;
      needsLogin?: boolean;
    }
  | { type: "done"; elapsedMs: number };

type Emit = (event: FareEvent) => void;

/** A tiny channel so parallel producers can feed one sequential generator. */
function channel<T>() {
  const buffer: T[] = [];
  let resolveNext: ((value: IteratorResult<T>) => void) | null = null;
  let closed = false;

  return {
    push(value: T) {
      if (closed) return;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value, done: false });
      } else {
        buffer.push(value);
      }
    },
    close() {
      closed = true;
      if (resolveNext) {
        const r = resolveNext;
        resolveNext = null;
        r({ value: undefined as never, done: true });
      }
    },
    async *[Symbol.asyncIterator](): AsyncGenerator<T> {
      while (true) {
        if (buffer.length > 0) {
          yield buffer.shift() as T;
          continue;
        }
        if (closed) return;
        const result = await new Promise<IteratorResult<T>>((resolve) => {
          resolveNext = resolve;
        });
        if (result.done) return;
        yield result.value;
      }
    },
  };
}

async function runProvider(
  provider: Provider,
  pickup: Coord,
  drop: Coord,
  routeKey: string,
  emit: Emit,
  signal?: AbortSignal,
): Promise<void> {
  const base = { type: "provider" as const, provider: provider.id, label: provider.label };

  // 1. Cache first. A fresh hit means no provider contact at all.
  const cached = await readCache(routeKey, provider.id).catch(() => null);
  if (cached?.band === "fresh") {
    emit({ ...base, state: "cached", options: cached.options, ageSec: cached.ageSec });
    return;
  }

  // 2. Admission. Checked before the queue so an unconnected provider never
  //    consumes a slot or a unit of the daily budget.
  const status = provider.requiresSession ? await readStatus(provider.id) : null;
  const hasSession =
    !provider.requiresSession ||
    (status !== null && status.status !== "disconnected" && status.status !== "expired");

  const admission = await admit(provider.id, {
    requiresSession: provider.requiresSession,
    hasSession,
  });

  if (!admission.ok) {
    // Serve whatever we have, clearly labelled, rather than an error.
    if (cached) {
      emit({
        ...base,
        state: "stale",
        options: cached.options,
        ageSec: cached.ageSec,
        reason: admission.reason,
        needsLogin: admission.needsLogin,
      });
    } else {
      emit({
        ...base,
        state: "unavailable",
        reason: admission.reason,
        needsLogin: admission.needsLogin,
      });
    }
    return;
  }

  // 3. Stale-while-revalidate: show what we have, then upgrade it.
  if (cached) {
    emit({ ...base, state: "stale", options: cached.options, ageSec: cached.ageSec });
  } else {
    emit({ ...base, state: "fetching" });
  }

  if (signal?.aborted) return;

  try {
    // Twenty visitors on one route cost the shared account exactly one call.
    const options = await singleFlight(`${provider.id}:${routeKey}`, () =>
      enqueue(provider.id, () => provider.fetchFares(pickup, drop)),
    );

    if (signal?.aborted) return;

    recordSuccess(provider.id);
    // Passive health: an organic fetch is the cheapest possible signal that
    // the session still works, so active probes almost never need to run.
    if (provider.requiresSession) {
      await markSuccess(provider.id).catch(() => {});
    }
    await writeCache(routeKey, provider.id, options).catch(() => {});
    emit({ ...base, state: "fresh", options });
  } catch (err) {
    if (signal?.aborted) return;

    if (err instanceof SessionError) {
      recordAuthFailure(provider.id, err.message);
      // One transient 401 is not enough to tear down a working login; the
      // store only flips to expired on the second consecutive failure.
      if (provider.requiresSession && err.code === "AUTH_EXPIRED") {
        await markAuthFailure(provider.id).catch(() => {});
      }
      emit({
        ...base,
        state: cached ? "stale" : "unavailable",
        options: cached?.options,
        ageSec: cached?.ageSec,
        reason: err.message,
        needsLogin: true,
      });
      return;
    }

    if (err instanceof NoRidesError) {
      // A legitimate answer, not a failure. It must not open the breaker.
      emit({ ...base, state: "fresh", options: [], reason: err.message });
      return;
    }

    recordError(provider.id, err instanceof Error ? err.message : "Provider error");
    emit({
      ...base,
      state: cached ? "stale" : "unavailable",
      options: cached?.options,
      ageSec: cached?.ageSec,
      reason: "Could not reach this provider",
    });
  }
}

export async function* streamFares(
  pickup: Coord,
  drop: Coord,
  opts: { signal?: AbortSignal; providers?: Provider[] } = {},
): AsyncGenerator<FareEvent> {
  const started = Date.now();
  const list = opts.providers ?? allProviders;
  const routeKey = makeRouteKey(pickup, drop);

  yield {
    type: "meta",
    straightLineKm: straightLineKm(pickup, drop),
    routeKey,
    providers: list.map((p) => p.id),
  };

  // Everything starts queued so the UI can render all three rows at once.
  for (const provider of list) {
    yield {
      type: "provider",
      provider: provider.id,
      label: provider.label,
      state: "queued",
    };
  }

  const ch = channel<FareEvent>();
  const work = Promise.all(
    list.map((provider) =>
      runProvider(provider, pickup, drop, routeKey, (e) => ch.push(e), opts.signal).catch(
        () => {},
      ),
    ),
  ).finally(() => ch.close());

  for await (const event of ch) {
    yield event;
    if (opts.signal?.aborted) break;
  }

  await work;
  yield { type: "done", elapsedMs: Date.now() - started };
}

/** Server-rendered first paint: whatever is already cached, no provider contact. */
export async function readCachedFares(
  pickup: Coord,
  drop: Coord,
): Promise<{ routeKey: string; results: { provider: ProviderId; label: string; state: ProviderState; options: FareOption[]; ageSec: number }[] }> {
  const routeKey = makeRouteKey(pickup, drop);
  const results = [];
  for (const provider of allProviders) {
    const hit = await readCache(routeKey, provider.id).catch(() => null);
    if (!hit) continue;
    results.push({
      provider: provider.id,
      label: provider.label,
      state: (hit.band === "fresh" ? "cached" : "stale") as ProviderState,
      options: hit.options,
      ageSec: hit.ageSec,
    });
  }
  return { routeKey, results };
}

export { fareConfig };
