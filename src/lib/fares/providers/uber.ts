import type { Page, Response as PWResponse } from "playwright";
import { withPage } from "../browser";
import { fareConfig } from "../config";
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
  hasPricedFare,
  isAnonymousResponse,
  normalizeUber,
  type UberProductsResponse,
} from "./uber.normalize";

/**
 * Uber — page interception, because nothing else works.
 *
 * The documented REST API is gone, and the Products GraphQL operation only
 * succeeds from the PWA's own page context: an HTTP client sending a
 * byte-identical body with the same CSRF header is rejected, because the
 * underlying RTAPI wants an x-uber-token the page supplies internally.
 *
 * So we navigate the real screen with both endpoints encoded in the URL and
 * intercept the response.
 */

function point(coord: Coord) {
  return JSON.stringify({
    latitude: coord.latitude,
    longitude: coord.longitude,
    addressLine1: coord.address ?? coord.name ?? "",
    addressLine2: "",
    source: "SEARCH",
    provider: "google_places",
  });
}

export function productSelectionUrl(pickup: Coord, drop: Coord): string {
  // drop[0] is a literal array index — Uber supports multi-stop.
  return (
    "https://m.uber.com/go/product-selection" +
    `?pickup=${encodeURIComponent(point(pickup))}` +
    `&drop[0]=${encodeURIComponent(point(drop))}`
  );
}

/**
 * Navigates and returns the Products response.
 *
 * Products can fire twice: an optimistic blank pass followed by a priced one.
 * Resolving on the first match captures blank fares even with a valid
 * session, so a first match is kept only as a fallback while we keep
 * listening briefly for one that carries real numbers.
 */
export async function captureProducts(
  page: Page,
  url: string,
): Promise<UberProductsResponse> {
  let best: UberProductsResponse | null = null;
  let fallback: UberProductsResponse | null = null;
  let settleTimer: NodeJS.Timeout | null = null;
  let overallTimer: NodeJS.Timeout | null = null;
  let finish: () => void = () => {};

  const onResponse = async (response: PWResponse) => {
    try {
      // The gateway host has moved before, so match loosely on the URL and
      // precisely on the operation name.
      if (!response.url().includes("graphql")) return;
      const post = response.request().postDataJSON() as
        | { operationName?: string }
        | null;
      if (post?.operationName !== "Products") return;

      const json = (await response.json()) as UberProductsResponse;
      if (hasPricedFare(json)) {
        best = json;
        finish();
        return;
      }
      // Keep the blank pass as a fallback, but keep listening briefly in
      // case the priced one is still coming.
      fallback ??= json;
      settleTimer ??= setTimeout(finish, fareConfig.settleMs);
    } catch {
      // A body that will not parse is not the response we want.
    }
  };

  try {
    // The listener must be attached before goto, or a fast response is missed.
    page.on("response", onResponse);

    await new Promise<void>((resolve) => {
      finish = resolve;
      overallTimer = setTimeout(resolve, fareConfig.pageTimeoutMs);
      // Navigation can abort while the XHR we want is still in flight, so a
      // goto rejection is deliberately not fatal.
      page.goto(url, { waitUntil: "domcontentloaded" }).catch(() => {});
    });
  } finally {
    page.off("response", onResponse);
    if (settleTimer) clearTimeout(settleTimer);
    if (overallTimer) clearTimeout(overallTimer);
  }

  const json = best ?? fallback;
  if (!json) {
    throw new NoRidesError("Uber did not return a Products response", "uber");
  }
  return json;
}

export const uberProvider: Provider = {
  id: "uber",
  label: "Uber",
  requiresSession: true,

  async fetchFares(pickup: Coord, drop: Coord): Promise<FareOption[]> {
    const stored = await readSession("uber");
    if (!stored) {
      throw new SessionError("Uber is not connected", "NO_SESSION", "uber");
    }

    const url = productSelectionUrl(pickup, drop);
    const json = await withPage(
      "uber",
      (page) => captureProducts(page, url),
      stored.plaintext.storageState as never,
      stored.plaintext.userAgent,
    );

    const key = routeKey(pickup, drop);
    const anonymous = isAnonymousResponse(json);
    const options = anonymous ? [] : normalizeUber(json);

    void recordPayload({
      provider: "uber",
      routeKey: key,
      status: anonymous ? "anonymous" : "ok",
      body: json,
      parsed: options,
      parseError: anonymous
        ? "Anonymous session: catalogue returned with every fare blank"
        : options.length === 0
          ? "Parsed no rides from a priced catalogue"
          : null,
    });

    // A real catalogue with every price blank means the session is dead.
    // Never treat blank as zero.
    if (anonymous) {
      throw new SessionError(
        "Uber answered anonymously, so the session has expired",
        "AUTH_EXPIRED",
        "uber",
      );
    }

    if (options.length === 0) {
      throw new NoRidesError("Uber listed no rides on this route", "uber");
    }
    return options;
  },
};

/**
 * The phase-2 gate: fetch with no session at all and confirm we get a real
 * catalogue with blank prices. That proves the whole browser and interception
 * pipeline before any login exists.
 */
export async function fetchAnonymousCatalogue(
  pickup: Coord,
  drop: Coord,
): Promise<UberProductsResponse> {
  const url = productSelectionUrl(pickup, drop);
  return withPage("uber", (page) => captureProducts(page, url));
}
