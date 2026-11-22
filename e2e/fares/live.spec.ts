import { expect, test } from "@playwright/test";
import { autocomplete, geocodePlaceId, resolveFirst } from "@/lib/fares/geocode";
import { closeBrowser } from "@/lib/fares/browser";
import { rapidoProvider, rapidoUrl } from "@/lib/fares/providers/rapido";
import { fetchAnonymousCatalogue, productSelectionUrl } from "@/lib/fares/providers/uber";
import {
  hasPricedFare,
  isAnonymousResponse,
  normalizeUber,
} from "@/lib/fares/providers/uber.normalize";

/**
 * Live smoke tests against the real providers.
 *
 * Tagged @live so they can be excluded: they contact third parties, they are
 * slow, and they only mean anything from an Indian egress IP. Everything they
 * cover is also covered by fixture-based unit tests that need no network.
 *
 *   npx playwright test e2e/fares/live.spec.ts --project=laptop
 *   npx playwright test --grep-invert @live      # skip them
 */

test.describe("@live providers", () => {
  // Serial, and retried once: these hit live third parties, so a transient
  // slow response is expected rather than a defect. Everything they cover is
  // also covered by fixture-based tests that never touch the network.
  test.describe.configure({ mode: "serial", timeout: 180_000, retries: 1 });

  test.beforeAll(() => {
    // Uber's PWA is heavy and these run alongside the rest of the suite, so
    // give the page a budget that reflects a loaded machine rather than an
    // idle one. fareConfig reads env lazily, so this takes effect per run.
    process.env.FARE_PAGE_TIMEOUT_MS = "90000";
    process.env.FARE_SETTLE_MS = "6000";
  });

  test.afterAll(async () => {
    await closeBrowser();
  });

  test("geocoder returns real places and coordinates", async () => {
    const suggestions = await autocomplete("Indiranagar", {
      latitude: 12.9716,
      longitude: 77.5946,
    });
    expect(suggestions.length).toBeGreaterThan(0);

    const top = suggestions[0];
    expect(top.placeId).toBeTruthy();
    // The short locality is what Rapido's fare URL needs, and it cannot be
    // recovered from the formatted description afterwards.
    expect(top.name).toBeTruthy();
    expect(top.description).toContain("Bengaluru");

    const coord = await geocodePlaceId(top.placeId, top.name);
    expect(coord).not.toBeNull();
    expect(coord!.latitude).toBeGreaterThan(12);
    expect(coord!.latitude).toBeLessThan(14);
    expect(coord!.name).toBe("Indiranagar");
  });

  test("rapido URL is built from locality and city", async () => {
    const pickup = await resolveFirst("Indiranagar");
    const drop = await resolveFirst("Koramangala");
    expect(pickup).not.toBeNull();
    expect(drop).not.toBeNull();

    const url = rapidoUrl(pickup!, drop!);
    expect(url).toContain("/unup-home/seo/");
    expect(url).toContain("version=v3");
  });

  // The phase-3 gate: works with no login, verified in more than one city.
  for (const city of [
    { name: "Bengaluru", from: "Indiranagar", to: "Koramangala" },
    { name: "Delhi", from: "Connaught Place", to: "Saket" },
  ]) {
    test(`rapido quotes fares in ${city.name}`, async () => {
      const pickup = await resolveFirst(city.from);
      const drop = await resolveFirst(city.to);
      expect(pickup, `could not geocode ${city.from}`).not.toBeNull();
      expect(drop, `could not geocode ${city.to}`).not.toBeNull();

      const options = await rapidoProvider.fetchFares(pickup!, drop!);

      expect(options.length).toBeGreaterThan(0);
      for (const option of options) {
        expect(option.name).toBeTruthy();
        expect(option.price).toBeGreaterThan(0);
        expect(option.currency).toBe("INR");
      }
      console.log(
        `  ${city.name}:`,
        options.map((o) => `${o.name} ₹${o.price}${o.priceNote ? ` (${o.priceNote})` : ""}`).join(", "),
      );
    });
  }

  // The phase-2 gate. With no session at all Uber still returns a real
  // catalogue with every price blanked, which proves the browser pool, the
  // URL encoding and the GraphQL interception all work before any login
  // exists to confuse the picture.
  test("uber returns a real catalogue with blank fares when logged out", async () => {
    const pickup = await resolveFirst("Indiranagar");
    const drop = await resolveFirst("Koramangala");
    expect(pickup).not.toBeNull();
    expect(drop).not.toBeNull();

    const url = productSelectionUrl(pickup!, drop!);
    expect(url).toContain("drop[0]=");

    const json = await fetchAnonymousCatalogue(pickup!, drop!);

    const tiers = json.data?.products?.tiers ?? [];
    const products = tiers.flatMap((t) => t.products ?? []);
    console.log(
      `  uber anonymous: ${products.length} products across ${tiers.length} tiers`,
      `[${tiers.map((t) => t.title).join(", ")}]`,
    );

    expect(tiers.length).toBeGreaterThan(0);
    expect(products.length).toBeGreaterThan(0);

    // Blank, and recognised as blank rather than parsed as zero.
    expect(hasPricedFare(json)).toBe(false);
    expect(isAnonymousResponse(json)).toBe(true);
    // The normalizer must refuse to invent prices from an unpriced catalogue.
    expect(normalizeUber(json)).toEqual([]);
  });
});
