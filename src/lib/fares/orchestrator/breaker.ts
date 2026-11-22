import { fareConfig } from "../config";
import type { ProviderId } from "../types";

/**
 * Circuit breaker, one per provider.
 *
 * The point is not availability, it is account safety: hammering a dead
 * session with 401s is exactly what converts "expired" into "banned". So auth
 * failures trip it faster than plain errors, and the cooldown escalates.
 */

type BreakerState = {
  authFailures: number;
  errors: number;
  /** How many times it has opened, which selects the cooldown length. */
  trips: number;
  /** When it last opened, so escalation can decay after a healthy spell. */
  lastTripAt: number;
  openUntil: number;
  lastReason: string | null;
};

const states = new Map<ProviderId, BreakerState>();

function state(provider: ProviderId): BreakerState {
  let s = states.get(provider);
  if (!s) {
    s = {
      authFailures: 0,
      errors: 0,
      trips: 0,
      lastTripAt: 0,
      openUntil: 0,
      lastReason: null,
    };
    states.set(provider, s);
  }
  return s;
}

export function isOpen(provider: ProviderId): boolean {
  return Date.now() < state(provider).openUntil;
}

export function openReason(provider: ProviderId): string | null {
  return isOpen(provider) ? state(provider).lastReason : null;
}

export function retryAfterSec(provider: ProviderId): number {
  const remaining = state(provider).openUntil - Date.now();
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

function trip(provider: ProviderId, reason: string, retryAfterMs?: number): void {
  const s = state(provider);
  const cooldowns = fareConfig.breakerCooldownsMin;
  const minutes = cooldowns[Math.min(s.trips, cooldowns.length - 1)];
  // Honour the provider's own Retry-After when it gave us one.
  const cooldownMs = Math.max(retryAfterMs ?? 0, minutes * 60_000);

  s.trips += 1;
  s.lastTripAt = Date.now();
  s.openUntil = Date.now() + cooldownMs;
  s.lastReason = reason;
  s.authFailures = 0;
  s.errors = 0;
}

export function recordSuccess(provider: ProviderId): void {
  const s = state(provider);
  s.authFailures = 0;
  s.errors = 0;
  s.openUntil = 0;
  s.lastReason = null;

  // The escalation level survives a single success on purpose. A provider
  // that recovers briefly and fails again is exactly the case escalation
  // exists for; only a sustained healthy spell earns a clean slate.
  const longest = fareConfig.breakerCooldownsMin[fareConfig.breakerCooldownsMin.length - 1];
  if (s.lastTripAt > 0 && Date.now() - s.lastTripAt > longest * 60_000) {
    s.trips = 0;
    s.lastTripAt = 0;
  }
}

export function recordAuthFailure(provider: ProviderId, reason = "Session expired"): void {
  const s = state(provider);
  s.authFailures += 1;
  if (s.authFailures >= fareConfig.breakerAuthFailures) trip(provider, reason);
}

export function recordError(
  provider: ProviderId,
  reason = "Provider errors",
  retryAfterMs?: number,
): void {
  const s = state(provider);
  s.errors += 1;
  if (s.errors >= fareConfig.breakerErrors) trip(provider, reason, retryAfterMs);
}

/** Test seam. */
export function resetBreakers(): void {
  states.clear();
}

export function breakerSnapshot(provider: ProviderId) {
  const s = state(provider);
  return {
    open: isOpen(provider),
    authFailures: s.authFailures,
    errors: s.errors,
    trips: s.trips,
    retryAfterSec: retryAfterSec(provider),
    reason: s.lastReason,
  };
}
