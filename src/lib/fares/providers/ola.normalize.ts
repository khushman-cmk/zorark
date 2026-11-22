import { money, positiveOrNull, titleCase } from "../money";
import type { FareOption } from "../types";

/**
 * Ola returns fares and availability from two separate endpoints, joined on
 * the category id: the fare call gives the price, the availability call gives
 * the display name and the ETA.
 */

export type OlaFareResponse = {
  data?: {
    p2p?: {
      categories?: Record<string, { price?: string | null; fareId?: string | null }> | null;
    } | null;
  } | null;
  error?: unknown;
};

export type OlaAvailabilityResponse = {
  data?: {
    nextCallAfter?: number | null;
    p2p?: {
      categories?:
        | {
            id?: string | null;
            displayName?: string | null;
            canRideNow?: boolean | null;
            eta?: { value?: number | null; unit?: string | null } | null;
          }[]
        | null;
    } | null;
  } | null;
};

/** Ola sometimes answers 200 with an error envelope, so the body is checked too. */
export function looksUnauthenticated(status: number, body: string): boolean {
  if (status === 401) return true;
  return /IDENTITY_MISSING|NOT_LOGGED_IN/.test(body);
}

export function normalizeOla(
  fares: OlaFareResponse,
  availability: OlaAvailabilityResponse | null,
): FareOption[] {
  const categories = fares.data?.p2p?.categories ?? {};

  // Availability is decorative: it must never fail a fare that parsed fine.
  const meta = new Map<string, { displayName: string | null; etaMin: number | null; canRideNow: boolean }>();
  for (const entry of availability?.data?.p2p?.categories ?? []) {
    if (!entry?.id) continue;
    meta.set(entry.id, {
      displayName: entry.displayName?.trim() || null,
      // eta.value === -1 means unknown; rendering it naively gives "-1 min".
      etaMin: positiveOrNull(entry.eta?.value),
      canRideNow: entry.canRideNow !== false,
    });
  }

  const options: FareOption[] = [];
  for (const [id, category] of Object.entries(categories)) {
    const price = money(category?.price);
    if (price === null) continue;

    const info = meta.get(id);
    options.push({
      name: info?.displayName ?? titleCase(id),
      category: id,
      price,
      currency: "INR",
      etaText: info?.etaMin != null ? `${info.etaMin} min` : null,
      durationMin: info?.etaMin ?? null,
      capacity: null,
      priceNote: info && !info.canRideNow ? "Not available right now" : null,
    });
  }

  return options;
}
