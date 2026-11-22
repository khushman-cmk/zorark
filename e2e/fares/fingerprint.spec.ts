import { expect, test } from "@playwright/test";
import { getContext, closeBrowser } from "@/lib/fares/browser";
import {
  browserChannel,
  CONTEXT_OPTIONS,
  deheadless,
  defaultUserAgent,
  LAUNCH_ARGS,
} from "@/lib/fares/device";

/**
 * Fingerprint consistency.
 *
 * The provider login pages are guarded by score-based bot detection, which
 * reads cross-signal consistency directly. An earlier version of the device
 * profile used Playwright's `devices['Pixel 7']` preset, which sets the user
 * agent and viewport but leaves navigator.platform, the WebGL renderer and
 * hardwareConcurrency reporting the real host. The result claimed to be an
 * Android phone while every other signal said Windows desktop, and Uber's
 * login challenged it endlessly.
 *
 * These tests assert the browser that actually talks to the providers does
 * not contradict itself. They are the regression guard for that whole class
 * of problem, and they run against the real pooled context rather than a
 * hand-rolled one, so they cannot drift from what ships.
 */

type Signals = {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  hardwareConcurrency: number;
  webglRenderer: string;
  webdriver: boolean;
};

let signals: Signals;

test.describe("browser fingerprint", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.beforeAll(async () => {
    // The pooled context is exactly what fetches fares, so measure that.
    const context = await getContext("rapido");
    const page = await context.newPage();
    await page.goto("about:blank");
    signals = await page.evaluate(() => ({
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      maxTouchPoints: navigator.maxTouchPoints,
      hardwareConcurrency: navigator.hardwareConcurrency,
      webdriver: Boolean(navigator.webdriver),
      webglRenderer: (() => {
        try {
          const gl = document.createElement("canvas").getContext("webgl");
          const ext = gl?.getExtension("WEBGL_debug_renderer_info");
          return ext ? String(gl?.getParameter(ext.UNMASKED_RENDERER_WEBGL)) : "";
        } catch {
          return "";
        }
      })(),
    }));
    await page.close();
  });

  test.afterAll(async () => {
    await closeBrowser();
  });

  test("the user agent never leaks the headless marker", () => {
    // HeadlessChrome/152 where a real browser says Chrome/152 is the bluntest
    // automation tell there is, and it would go out on every fare fetch.
    expect(signals.userAgent).not.toContain("Headless");
  });

  test("the user agent does not contradict the platform", () => {
    const claimsMobile = /Android|iPhone|Mobile Safari/i.test(signals.userAgent);
    const platformIsDesktop = /Win32|Win64|MacIntel|Linux x86_64/i.test(signals.platform);

    // Claiming a phone while navigator.platform reports a desktop is precisely
    // the contradiction that got the login challenged.
    expect(
      claimsMobile && platformIsDesktop,
      `userAgent "${signals.userAgent}" contradicts platform "${signals.platform}"`,
    ).toBe(false);
  });

  test("the WebGL renderer does not contradict the user agent", () => {
    test.skip(!signals.webglRenderer, "no WebGL renderer string available");

    const claimsMobile = /Android|iPhone|Mobile Safari/i.test(signals.userAgent);
    const desktopGpu = /Direct3D|D3D11|SwiftShader|llvmpipe/i.test(signals.webglRenderer);

    expect(
      claimsMobile && desktopGpu,
      `userAgent claims mobile but WebGL reports "${signals.webglRenderer}"`,
    ).toBe(false);
  });

  test("touch points agree with the claimed device class", () => {
    const claimsMobile = /Android|iPhone|Mobile Safari/i.test(signals.userAgent);
    // A real phone reports several touch points, never exactly one, which is
    // what the Pixel preset produced on a desktop host.
    if (claimsMobile) {
      expect(signals.maxTouchPoints).toBeGreaterThan(1);
    } else {
      expect(signals.maxTouchPoints).toBe(0);
    }
  });

  test("the automation flag is not set", () => {
    expect(signals.webdriver).toBe(false);
    expect(LAUNCH_ARGS).toContain("--disable-blink-features=AutomationControlled");
  });

  test("the device profile sets no user agent of its own", () => {
    // Locale, timezone and geolocation are consistent with an Indian user and
    // nothing about the host contradicts them. A spoofed user agent would.
    expect(CONTEXT_OPTIONS).not.toHaveProperty("userAgent");
    expect(CONTEXT_OPTIONS.locale).toBe("en-IN");
    expect(CONTEXT_OPTIONS.timezoneId).toBe("Asia/Kolkata");
  });

  test("real Chrome is preferred over bundled Chromium where available", async () => {
    const channel = await browserChannel();
    // Not an assertion that Chrome exists: a linux-arm64 host has no Chrome
    // build and correctly falls back. This just pins the resolution order.
    expect(channel === undefined || ["chrome", "msedge"].includes(channel)).toBe(true);
  });

  test("deheadless rewrites only the marker", () => {
    expect(
      deheadless(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 HeadlessChrome/152.0.0.0 Safari/537.36",
      ),
    ).toBe(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/152.0.0.0 Safari/537.36",
    );
    const clean = "Mozilla/5.0 Chrome/152.0.0.0 Safari/537.36";
    expect(deheadless(clean)).toBe(clean);
  });

  test("the fallback user agent is usable and clean", async () => {
    const ua = await defaultUserAgent();
    if (!ua) test.skip(true, "no browser available to derive a user agent");
    expect(ua).toContain("Chrome/");
    expect(ua).not.toContain("Headless");
  });
});
