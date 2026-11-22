import type { Coord } from "./types";

/**
 * Geocoding for the whole system.
 *
 * Rapido exposes two open endpoints that need no key and no login, and they
 * serve all three providers. Verified live: an autocomplete for "Indiranagar"
 * returns the documented shape with place IDs and formatted descriptions.
 *
 * The search parameter is `searchWord`. `query`, `text` and `q` all fail with
 * a validation error, so do not "tidy" it.
 */

const BASE = "https://m.rapido.bike/pwa/api/unup";

const HEADERS = {
  "Content-Type": "application/json",
  Origin: "https://m.rapido.bike",
  Referer: "https://m.rapido.bike/",
} as const;

export type PlaceSuggestion = {
  placeId: string;
  /** Full formatted address. */
  description: string;
  /**
   * Short locality name. Rapido's fare URL needs this rather than the full
   * description, and it cannot be recovered later, so it is carried through
   * every layer down to the adapter.
   */
  name: string;
};

type AutocompleteResponse = {
  info?: { status?: string };
  data?: { placeId?: string; description?: string; name?: string }[];
};

type GeocodeResponse = {
  info?: { status?: string };
  data?: { lat?: number; lng?: number; address?: string };
};

async function postJson<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: HEADERS,
    body: JSON.stringify(body),
    signal,
    cache: "no-store",
  });
  if (!response.ok) {
    throw new Error(`Rapido ${path} returned ${response.status}`);
  }
  return (await response.json()) as T;
}

/**
 * Place suggestions for a search term. `near` biases results toward a point
 * and is optional.
 */
export async function autocomplete(
  searchWord: string,
  near?: { latitude: number; longitude: number },
  signal?: AbortSignal,
): Promise<PlaceSuggestion[]> {
  const term = searchWord.trim();
  if (term.length < 2) return [];

  const json = await postJson<AutocompleteResponse>(
    "/autocomplete/location",
    {
      searchWord: term,
      ...(near ? { latitude: near.latitude, longitude: near.longitude } : {}),
    },
    signal,
  );

  return (json.data ?? [])
    .filter((item): item is Required<Pick<typeof item, "placeId">> & typeof item =>
      Boolean(item.placeId),
    )
    .map((item) => ({
      placeId: item.placeId as string,
      description: item.description ?? item.name ?? "",
      name: item.name ?? (item.description ?? "").split(",")[0]?.trim() ?? "",
    }));
}

/** Resolves a place ID to coordinates plus the formatted address. */
export async function geocodePlaceId(
  placeId: string,
  fallbackName?: string,
  signal?: AbortSignal,
): Promise<Coord | null> {
  const json = await postJson<GeocodeResponse>(
    "/location/geocode/placeId",
    { placeId },
    signal,
  );

  const data = json.data;
  if (!data || typeof data.lat !== "number" || typeof data.lng !== "number") {
    return null;
  }

  const address = data.address ?? "";
  return {
    latitude: data.lat,
    longitude: data.lng,
    address,
    name: fallbackName?.trim() || address.split(",")[0]?.trim() || undefined,
  };
}

/** Convenience for tests and canary probes: search, then resolve the top hit. */
export async function resolveFirst(
  searchWord: string,
  near?: { latitude: number; longitude: number },
): Promise<Coord | null> {
  const [top] = await autocomplete(searchWord, near);
  if (!top) return null;
  return geocodePlaceId(top.placeId, top.name);
}
