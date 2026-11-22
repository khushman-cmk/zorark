import { expect, test, type Page } from "@playwright/test";

/**
 * The Safe Directions page end to end, on every viewport.
 *
 * The basemap host is stubbed with an empty style so the test never depends
 * on an external tile server; our own layers draw on a plain background.
 */

async function stubBasemap(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        sources: {},
        layers: [{ id: "background", type: "background", paint: { "background-color": "#eeeeee" } }],
      }),
    }),
  );
}

test.beforeEach(async ({ page, request }) => {
  const status = (await (await request.get("/api/safety/status")).json()) as { data?: { engine?: { up?: boolean } } };
  test.skip(!status.data?.engine?.up, "routing engine not running (npm run gh:start)");
  await stubBasemap(page);
});

test("example route: compare, explain, overlay", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/home/directions");
  await page.getByRole("button", { name: /Kotla Mubarakpur/ }).click();

  const safest = page.getByTestId("route-card-safest");
  await expect(safest).toBeVisible({ timeout: 20_000 });
  await expect(safest).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("route-card-fastest")).toBeVisible();
  // URLSearchParams encodes the comma.
  await expect(page).toHaveURL(/from=28\.58039(%2C|,)77\.21501/);

  // The fastest route's risks are listed when it is selected.
  await page.getByTestId("route-card-fastest").click();
  await expect(page.getByTestId("explain-list")).toContainText("unplanned area");
  const stretch = page.getByTestId("stretch").first();
  await stretch.click();
  await expect(stretch).toHaveAttribute("aria-pressed", "true");

  const overlayLoaded = page.waitForResponse((r) => r.url().endsWith("/safety/overlay.geojson") && r.ok());
  await page.getByTestId("toggle-overlay").click();
  await overlayLoaded;
  await expect(page.getByTestId("map-legend")).toContainText("Near water");

  await expect(page.getByTestId("directions-map").locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("shared links restore the route", async ({ page }) => {
  await page.goto("/home/directions?from=28.51495,77.27621&fromName=East&to=28.51025,77.25779&toName=West");
  await expect(page.getByTestId("dir-from-selected")).toHaveText("East");
  await expect(page.getByTestId("route-card-safest")).toBeVisible({ timeout: 20_000 });
});

test("report mode opens the pothole dialog on a map click", async ({ page }) => {
  await page.goto("/home/directions");
  await page.getByTestId("toggle-report").click();
  await expect(page.getByText("Tap the road where the pothole is")).toBeVisible();

  const map = page.getByTestId("directions-map");
  await expect(map.locator("canvas")).toHaveCount(1);
  const box = (await map.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

  const dialog = page.getByTestId("report-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radio", { name: /Dangerous/ })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("points outside NCR get a clear message", async ({ page }) => {
  await page.goto("/home/directions?from=19.07600,72.87700&to=28.56901,77.23139");
  await expect(page.getByTestId("directions-error")).toContainText("Delhi NCR");
});
