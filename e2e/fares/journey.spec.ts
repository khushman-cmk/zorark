import { expect, test, type Page } from "@playwright/test";

/**
 * User-level journeys through a real browser.
 *
 * These drive the app the way a person does: type a place, pick a suggestion,
 * watch the provider rows resolve. Geocoding is stubbed so the journey does
 * not depend on a third party being up, but the SSE plumbing, the streaming
 * UI and the admin screens are all exercised for real.
 */

const INDIRANAGAR = {
  placeId: "ChIJkQN3GKQWrjsRNhBQJrhGD7U",
  description: "Indiranagar, Bengaluru, Karnataka, India",
  name: "Indiranagar",
};

const KORAMANGALA = {
  placeId: "ChIJb0n5cNIVrjsRmvcrhAsZBpQ",
  description: "Koramangala, Bengaluru, Karnataka, India",
  name: "Koramangala",
};

const COORDS: Record<string, { latitude: number; longitude: number }> = {
  [INDIRANAGAR.placeId]: { latitude: 12.9783692, longitude: 77.6408356 },
  [KORAMANGALA.placeId]: { latitude: 12.9352403, longitude: 77.624532 },
};

/** Keeps the journey deterministic and off the providers' geocoder. */
async function stubGeocoding(page: Page) {
  await page.route("**/api/fares/geocode**", async (route) => {
    const url = new URL(route.request().url());
    const placeId = url.searchParams.get("placeId");

    if (placeId) {
      const coord = COORDS[placeId];
      const place = [INDIRANAGAR, KORAMANGALA].find((p) => p.placeId === placeId);
      return route.fulfill({
        json: {
          data: {
            latitude: coord.latitude,
            longitude: coord.longitude,
            address: place?.description,
            name: place?.name,
          },
        },
      });
    }

    const q = (url.searchParams.get("q") ?? "").toLowerCase();
    const matches = [INDIRANAGAR, KORAMANGALA].filter((p) =>
      p.name.toLowerCase().startsWith(q),
    );
    return route.fulfill({ json: { data: matches } });
  });
}

/** A scripted SSE response, so state transitions can be asserted exactly. */
async function stubStream(page: Page, body: string) {
  await page.route("**/api/fares/stream**", async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
      body,
    });
  });
}

function sse(events: [string, unknown][]): string {
  return events.map(([type, data]) => `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`).join("");
}

test.describe("fare comparison journey", () => {
  test("search a route and watch providers resolve", async ({ page }) => {
    await stubGeocoding(page);
    await stubStream(
      page,
      sse([
        ["meta", { straightLineKm: 5.11, routeKey: "k", providers: ["uber", "ola", "rapido"] }],
        ["provider", { provider: "uber", label: "Uber", state: "queued" }],
        ["provider", { provider: "ola", label: "Ola", state: "queued" }],
        ["provider", { provider: "rapido", label: "Rapido", state: "queued" }],
        [
          "provider",
          {
            provider: "rapido",
            label: "Rapido",
            state: "fresh",
            options: [
              { name: "Auto", category: "auto", price: 104, currency: "INR", priceNote: "Range ₹104–₹125", etaText: null, durationMin: null, capacity: null },
              { name: "Bike", category: "bike", price: 45, currency: "INR", etaText: null, durationMin: null, capacity: null },
            ],
          },
        ],
        [
          "provider",
          {
            provider: "uber",
            label: "Uber",
            state: "unavailable",
            reason: "Not connected",
            needsLogin: true,
          },
        ],
        [
          "provider",
          {
            provider: "ola",
            label: "Ola",
            state: "fresh",
            options: [
              { name: "Mini", category: "mini", price: 142, currency: "INR", etaText: "4 min", durationMin: 4, capacity: null },
            ],
          },
        ],
        ["done", { elapsedMs: 1200 }],
      ]),
    );

    await page.goto("/home/ride");
    await expect(page.getByRole("heading", { name: "Book a Ride" })).toBeVisible();

    // Type, then choose from the suggestion list.
    await page.getByTestId("pickup").fill("Indira");
    await expect(page.getByTestId("pickup-suggestions")).toBeVisible();
    await page.getByTestId("pickup-suggestions").getByText(INDIRANAGAR.description).click();
    await expect(page.getByTestId("pickup-selected")).toHaveText(INDIRANAGAR.description);

    await page.getByTestId("drop").fill("Korama");
    await expect(page.getByTestId("drop-suggestions")).toBeVisible();
    await page.getByTestId("drop-suggestions").getByText(KORAMANGALA.description).click();
    await expect(page.getByTestId("drop-selected")).toHaveText(KORAMANGALA.description);

    await page.getByTestId("compare-fares").click();
    await page.waitForURL(/pickupLat=/);

    await expect(page.getByTestId("fare-results")).toBeVisible();

    // Every provider gets a row, including the ones that cannot answer.
    for (const provider of ["uber", "ola", "rapido"]) {
      await expect(page.getByTestId(`provider-${provider}`)).toBeVisible();
    }

    // Prices, and the cheapest across all providers is flagged.
    const rapido = page.getByTestId("provider-rapido");
    await expect(rapido.getByText("₹104", { exact: true })).toBeVisible();
    await expect(rapido.getByText("Range ₹104–₹125")).toBeVisible();
    await expect(rapido.getByText("Cheapest")).toBeVisible();

    await expect(
      page.getByTestId("provider-ola").getByText("₹142", { exact: true }),
    ).toBeVisible();

    // An unconnected provider says so and offers the fix, rather than
    // silently showing nothing.
    const uber = page.getByTestId("provider-uber");
    await expect(uber.getByText("Not connected")).toBeVisible();
    await expect(uber.getByRole("link", { name: "Reconnect" })).toBeVisible();
  });

  test("a row with prices never regresses to an error", async ({ page }) => {
    await stubGeocoding(page);
    // Priced first, then a later event that carries no data at all. The row
    // must keep its prices and only surface the reason.
    await stubStream(
      page,
      sse([
        ["meta", { straightLineKm: 5.11, routeKey: "k", providers: ["rapido"] }],
        ["provider", { provider: "rapido", label: "Rapido", state: "queued" }],
        [
          "provider",
          {
            provider: "rapido",
            label: "Rapido",
            state: "fresh",
            options: [
              { name: "Auto", category: "auto", price: 104, currency: "INR", etaText: null, durationMin: null, capacity: null },
            ],
          },
        ],
        [
          "provider",
          {
            provider: "rapido",
            label: "Rapido",
            state: "unavailable",
            reason: "Could not reach this provider",
          },
        ],
        ["done", { elapsedMs: 900 }],
      ]),
    );

    await page.goto(
      "/home/ride?pickupLat=12.9783692&pickupLng=77.6408356&pickupAddress=Indiranagar&pickupName=Indiranagar&dropLat=12.9352403&dropLng=77.624532&dropAddress=Koramangala&dropName=Koramangala",
    );

    const row = page.getByTestId("provider-rapido");
    await expect(row.getByText("₹104", { exact: true })).toBeVisible();
    await expect(row.getByText("Could not reach this provider")).toBeVisible();
    // The prices survived, and the row did not fall back to "unavailable".
    await expect(row).not.toHaveAttribute("data-state", "unavailable");
    await expect(row.getByText("₹104", { exact: true })).toBeVisible();
  });

  test("the empty state asks for a route", async ({ page }) => {
    await stubGeocoding(page);
    await page.goto("/home/ride");
    await expect(page.getByText("Enter a pickup and a drop to compare live fares.")).toBeVisible();
    await expect(page.getByTestId("compare-fares")).toBeDisabled();
  });
});

test.describe("admin surfaces", () => {
  test("connections page shows every provider and its status", async ({ page }) => {
    await page.goto("/admin/connections");

    await expect(page.getByRole("heading", { name: "Provider connections" })).toBeVisible();

    for (const provider of ["uber", "ola", "rapido"]) {
      await expect(page.getByTestId(`conn-${provider}`)).toBeVisible();
    }

    // Rapido is anonymous: it must never be presented as something to connect.
    const rapido = page.getByTestId("conn-rapido");
    await expect(rapido.getByText("Anonymous")).toBeVisible();
    await expect(rapido.getByRole("button", { name: "Connect here" })).toHaveCount(0);
    await expect(rapido.getByRole("button", { name: "Disconnect" })).toHaveCount(0);

    // The two that do need a session offer both connect paths.
    await expect(page.getByTestId("connect-uber")).toBeVisible();
    await expect(page.getByTestId("connect-ola")).toBeVisible();
  });

  test("payload console lists captures and inspects one", async ({ page }) => {
    await page.goto("/admin/payloads");
    await expect(page.getByRole("heading", { name: "Payload console" })).toBeVisible();

    // The table fills from a fetch, so wait for it to settle before deciding
    // whether there is anything to inspect.
    await expect(
      page.getByRole("button", { name: "Inspect" }).first().or(page.getByText(/No payloads/)),
    ).toBeVisible();

    const inspect = page.getByRole("button", { name: "Inspect" }).first();
    if ((await inspect.count()) === 0) {
      test.skip(true, "no payloads recorded yet on this database");
    }

    await inspect.click();
    // The three views over the same record.
    await expect(page.getByRole("button", { name: "pretty" })).toBeVisible();
    await expect(page.getByRole("button", { name: "raw" })).toBeVisible();
    await expect(page.getByRole("button", { name: "normalized" })).toBeVisible();

    // Schema-less discovery ranks the repeated per-ride field to the top.
    await expect(page.getByText("Likely fare fields")).toBeVisible();

    await page.getByRole("button", { name: "normalized" }).click();
    await expect(page.getByText(/₹\d/).first()).toBeVisible();
  });
});
