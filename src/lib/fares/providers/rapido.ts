import { withPage } from "../browser";
import { localityAndCity, routeKey } from "../route-key";
import { recordPayload } from "../payloads/record";
import { NoRidesError, type Coord, type FareOption, type Provider } from "../types";
import { normalizeRapido } from "./rapido.normalize";

/**
 * Rapido — the one that looks closed and isn't.
 *
 * Its authenticated pricing endpoints all return 401, which leads to the wrong
 * conclusion that an account is needed. It also publishes fares on public SEO
 * route pages that require no login at all.
 *
 * We cannot call the underlying scc/fareEstimate directly: four x-* headers
 * sign the request body, so calling without them returns INVALID_SIGNATURE and
 * rewriting the coordinates of an intercepted request returns 401. The page
 * has to issue its own request, which means the route comes from the URL, not
 * from coordinates we choose. Since the page must render anyway, reading the
 * rendered DOM is both simpler and sturdier than decoding the response.
 */

const CARD_SELECTOR = ".fare-estimate-wrapper .card-wrap";

export function rapidoUrl(pickup: Coord, drop: Coord): string | null {
  const from = localityAndCity(pickup);
  const to = localityAndCity(drop);
  if (!from || !to) return null;

  const seg = (l: string, c: string) =>
    `${encodeURIComponent(l)},${encodeURIComponent(c.toLowerCase())}`;

  return `https://m.rapido.bike/unup-home/seo/${seg(from.locality, from.city)}/${seg(
    to.locality,
    to.city,
  )}?version=v3`;
}

export async function fetchRapidoCards(url: string): Promise<string[]> {
  return withPage("rapido", async (page) => {
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Essential: the page renders its shell before the fare call returns, so
    // an unconditional scrape yields an empty list.
    await page.waitForSelector(CARD_SELECTOR, { timeout: 30_000 });

    return page.$$eval(CARD_SELECTOR, (nodes) =>
      nodes.map((el) => (el.textContent ?? "").replace(/\s+/g, " ").trim()),
    );
  });
}

export const rapidoProvider: Provider = {
  id: "rapido",
  label: "Rapido",
  // Nothing to connect. It must never appear in "needs attention".
  requiresSession: false,

  async fetchFares(pickup: Coord, drop: Coord): Promise<FareOption[]> {
    const url = rapidoUrl(pickup, drop);
    if (!url) {
      throw new NoRidesError(
        "Rapido needs a locality and city, and this address is too coarse to derive one",
        "rapido",
      );
    }

    const key = routeKey(pickup, drop);
    const cards = await fetchRapidoCards(url);
    const options = normalizeRapido(cards);

    // Archived either way: a structurally fine response that parsed to
    // nothing is the most interesting failure class there is.
    void recordPayload({
      provider: "rapido",
      routeKey: key,
      status: "ok",
      body: { url, cards },
      parsed: options,
      parseError:
        options.length === 0 ? "Scraped cards but parsed no fares" : null,
    });

    if (options.length === 0) {
      throw new NoRidesError("Rapido listed no services on this route", "rapido");
    }
    return options;
  },
};
