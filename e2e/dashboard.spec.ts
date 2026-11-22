import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const ROUTES = [
  "/home",
  "/home/ride",
  "/home/directions",
  "/home/travel",
  "/home/fuel",
  "/home/trips",
  "/home/wallet",
  "/home/profile",
] as const;

const THEMES = ["light", "dark"] as const;

/** Collects console errors and uncaught exceptions for the life of the page. */
function watchForErrors(page: Page) {
  const problems: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  return problems;
}

/**
 * Forces the theme before first paint rather than clicking the toggle, which
 * would race hydration. next-themes reads localStorage in its pre-paint script.
 */
async function useTheme(page: Page, theme: (typeof THEMES)[number]) {
  await page.addInitScript((t) => {
    try {
      localStorage.setItem("theme", t as string);
    } catch {
      /* private mode */
    }
  }, theme);
}

/** Reports which elements stick out, so a failure says what to fix. */
async function overflowReport(page: Page) {
  return page.evaluate(() => {
    const root = document.documentElement;
    const offenders: string[] = [];
    if (root.scrollWidth > root.clientWidth) {
      for (const el of Array.from(document.querySelectorAll("*"))) {
        const r = el.getBoundingClientRect();
        if (r.width > 0 && r.right > window.innerWidth + 1) {
          offenders.push(`${el.tagName.toLowerCase()} right=${Math.round(r.right)}`);
        }
      }
    }
    return { scrollWidth: root.scrollWidth, clientWidth: root.clientWidth, offenders };
  });
}

for (const theme of THEMES) {
  test.describe(`${theme} theme`, () => {
    for (const route of ROUTES) {
      test(`${route} renders cleanly`, async ({ page }) => {
        const problems = watchForErrors(page);
        await useTheme(page, theme);
        // The directions map's basemap is external; keep this suite offline-safe.
        await page.route("https://tiles.openfreemap.org/**", (r) =>
          r.fulfill({
            contentType: "application/json",
            body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "bg", type: "background", paint: { "background-color": "#eee" } }] }),
          }),
        );

        // MapLibre's web-worker script request is never reported as finished,
        // so "networkidle" cannot settle on the map page; wait for the map instead.
        const hasMap = route === "/home/directions";
        const response = await page.goto(route, { waitUntil: hasMap ? "load" : "networkidle" });
        expect(response?.status(), `${route} should not 404`).toBe(200);
        if (hasMap) await expect(page.getByTestId("directions-map").locator("canvas")).toHaveCount(1);

        // The theme class must follow next-themes, not prefers-color-scheme.
        await expect
          .poll(() => page.evaluate(() => document.documentElement.classList.contains("dark")))
          .toBe(theme === "dark");

        const overflow = await overflowReport(page);
        expect(overflow.offenders.join("\n")).toBe("");
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth);

        expect(problems.join("\n")).toBe("");
      });
    }

    test("every design token is defined and theme-aware", async ({ page }) => {
      await useTheme(page, theme);
      await page.goto("/home");

      const tokens = [
        "--zp-canvas", "--zp-surface", "--zp-sunken", "--zp-ink", "--zp-ink-soft",
        "--zp-muted", "--zp-line", "--zp-line-strong", "--zp-panel", "--zp-panel-fg",
        "--zp-panel-muted", "--zp-pink", "--zp-pink-strong", "--zp-pink-ink",
        "--zp-pink-soft", "--zp-success", "--zp-success-soft", "--zp-grad-pink",
        "--zp-hero-wash", "--zp-sky",
        "--zp-risk-low", "--zp-risk-med", "--zp-risk-high", "--zp-route-alt", "--zp-water", "--zp-rural",
      ];

      const missing = await page.evaluate((names) => {
        const style = getComputedStyle(document.documentElement);
        return names.filter((n) => !style.getPropertyValue(n).trim());
      }, tokens);

      expect(missing, "tokens with no value in this theme").toEqual([]);
    });

    test("dashboard has no colour-contrast violations", async ({ page }) => {
      await useTheme(page, theme);
      await page.goto("/home", { waitUntil: "networkidle" });

      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa"])
        .analyze();

      const contrast = results.violations.filter((v) => v.id === "color-contrast");
      const detail = contrast.flatMap((v) => v.nodes.map((n) => n.failureSummary ?? ""));
      expect(detail.join("\n---\n")).toBe("");
    });
  });
}

test("dashboard shows the expected content", async ({ page }) => {
  await page.goto("/home", { waitUntil: "networkidle" });

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Where are you headed today?")).toBeVisible();

  for (const id of ["quick-ride", "quick-travel", "quick-fuel"]) {
    await expect(page.getByTestId(id)).toBeVisible();
  }
  for (const city of ["Noida", "Delhi", "Gurgaon", "Agra"]) {
    await expect(page.getByTestId("card-destinations").getByText(city)).toBeVisible();
  }
  await expect(page.getByTestId("card-fuel")).toHaveCount(0);
  await expect(page.getByTestId("card-wallet").getByText("₹1,250")).toBeVisible();
  await expect(page.getByTestId("card-recent-ride").getByText("₹340")).toBeVisible();
});

test("admin styles do not leak into the dashboard on client navigation", async ({ page }) => {
  // Global CSS is not unloaded on navigation, so admin.css would stay resident
  // after an /admin visit. A direct load of /home can never catch that.
  //
  // The admin dashboard keeps a request open, so networkidle never settles on
  // it in a production build. Wait for the document instead.
  await page.goto("/admin", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("load");
  await page.goto("/home", { waitUntil: "networkidle" });

  const style = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    return {
      canvas: root.getPropertyValue("--zp-canvas").trim(),
      adminSurface: root.getPropertyValue("--surface-1").trim(),
      adminPink: root.getPropertyValue("--accent-pink").trim(),
      bodyBackground: getComputedStyle(document.body).backgroundColor,
    };
  });

  expect(style.canvas).toBe("#fafafa");
  expect(style.bodyBackground).toBe("rgb(250, 250, 250)");
  // admin.css defines these at :root; they must not be reachable from /home.
  expect(style.adminSurface).toBe("");
  expect(style.adminPink).toBe("");
});

test("mobile drawer opens, navigates, and closes", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "mobile", "drawer only exists below lg");

  await page.goto("/home", { waitUntil: "networkidle" });

  const drawerNav = page.getByRole("navigation", { name: "Main" });
  await expect(drawerNav).toBeHidden();

  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(drawerNav).toBeVisible();

  // Choosing a destination should both navigate and dismiss the drawer.
  await drawerNav.getByRole("link", { name: "Fuel Prices" }).click();
  await page.waitForURL("**/home/fuel");
  await expect(drawerNav).toBeHidden();

  // Escape closes it again.
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(drawerNav).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawerNav).toBeHidden();
});
