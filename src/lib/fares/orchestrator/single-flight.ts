/**
 * Collapses concurrent identical work into one call.
 *
 * Twenty visitors looking at the same route must cost the shared account
 * exactly one request, not twenty. Keyed on provider plus route.
 */

const inflight = new Map<string, Promise<unknown>>();

export function singleFlight<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fn().finally(() => {
    inflight.delete(key);
  });
  inflight.set(key, promise);
  return promise;
}

/** Current in-flight count, for admission control and tests. */
export function inflightCount(): number {
  return inflight.size;
}

export function clearInflight(): void {
  inflight.clear();
}
