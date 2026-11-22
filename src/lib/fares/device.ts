import { chromium } from "playwright";

/**
 * The browser identity, defined in exactly one place.
 *
 * The login browser, the page-fetch path and the remote-login browser all
 * import this. Divergence between them causes session invalidation that is
 * very hard to diagnose, because the session looks valid and simply stops
 * being accepted.
 *
 * ## Why there is no device emulation here
 *
 * The obvious move is `...devices['Pixel 7']`, and it is wrong. Playwright's
 * device presets exist for layout testing: they set the user agent, viewport,
 * touch flags and scale factor, and nothing else. They do not touch
 * `navigator.platform`, the WebGL renderer string, `hardwareConcurrency`, or
 * client hints. Measured on a Windows host, that preset produces:
 *
 *   userAgent        Android 14; Pixel 7 ... Mobile Safari
 *   navigator.platform   Win32
 *   maxTouchPoints       1          (a real Pixel 7 reports 5)
 *   WebGL renderer       ANGLE (Intel Arc ... Direct3D11)
 *   userAgentData        null       (real Chrome always populates this)
 *
 * Every one of those contradicts the user agent. Score-based bot detection —
 * which is what guards these login pages — checks exactly this kind of
 * cross-signal consistency, so the emulation makes things markedly worse than
 * doing nothing. It is the same class of mistake as putting a Safari user
 * agent on a Chromium engine, just in the other direction.
 *
 * So: no user-agent override, no device preset. Real Chrome where it exists,
 * reporting honestly about itself. Locale, timezone and geolocation are still
 * set, because those are consistent with an Indian user and nothing about the
 * host contradicts them.
 */
export const DEVICE_PROFILE_ID = "desktop-chrome-v2";

export const CONTEXT_OPTIONS = Object.freeze({
  locale: "en-IN",
  timezoneId: "Asia/Kolkata",
  geolocation: { latitude: 12.9784, longitude: 77.6408 },
  permissions: ["geolocation"],
});

export const LAUNCH_ARGS = Object.freeze([
  "--disable-blink-features=AutomationControlled",
  // The rest matter only in headful mode: Chromium throttles or halts
  // screencast on an unfocused or occluded window, which freezes the
  // remote-login stream.
  "--disable-backgrounding-occluded-windows",
  "--disable-renderer-backgrounding",
  "--disable-features=CalculateNativeWinOcclusion",
]);

/**
 * Which Chromium build to launch.
 *
 * Real Google Chrome is strongly preferred: the bundled Chromium differs from
 * it in ways detection notices (codec support, `navigator.plugins`, the
 * absence of Chrome-only APIs). Falls back to bundled Chromium, which is what
 * a linux-arm64 host has to use since Google ships no Chrome build for it.
 *
 * Resolved once and cached, because probing costs a browser launch.
 */
let resolvedChannel: string | undefined | null = null;

export async function browserChannel(): Promise<string | undefined> {
  if (resolvedChannel !== null) return resolvedChannel ?? undefined;

  const configured = process.env.FARE_BROWSER_CHANNEL?.trim();
  if (configured) {
    // "chromium" is the explicit opt-out of a branded channel.
    resolvedChannel = configured === "chromium" ? undefined : configured;
    return resolvedChannel ?? undefined;
  }

  for (const candidate of ["chrome", "msedge"]) {
    try {
      const probe = await chromium.launch({ channel: candidate, headless: true });
      await probe.close();
      resolvedChannel = candidate;
      return candidate;
    } catch {
      /* not installed on this host */
    }
  }

  resolvedChannel = undefined;
  return undefined;
}

export async function launchOptions(headless: boolean) {
  const channel = await browserChannel();
  return {
    headless,
    args: [...LAUNCH_ARGS],
    ...(channel ? { channel } : {}),
  };
}

/**
 * Removes the headless marker from a user agent.
 *
 * Headless Chrome reports `HeadlessChrome/152.0.0.0` where headful reports
 * `Chrome/152.0.0.0`. That token is one of the bluntest automation tells
 * there is, and it would otherwise go out on every fare fetch. Replaying the
 * user agent captured at login is always preferable; this is the fallback for
 * sessions that predate that capture, and for anonymous providers.
 */
export function deheadless(userAgent: string): string {
  return userAgent.replace(/HeadlessChrome/g, "Chrome");
}

/** The user agent this host will present, with the headless marker removed. */
let cachedUserAgent: string | null = null;

export async function defaultUserAgent(): Promise<string | undefined> {
  if (cachedUserAgent !== null) return cachedUserAgent || undefined;
  try {
    const { chromium } = await import("playwright");
    const channel = await browserChannel();
    const browser = await chromium.launch({
      headless: true,
      ...(channel ? { channel } : {}),
    });
    const raw = await browser
      .newContext()
      .then((c) => c.newPage())
      .then((p) => p.evaluate(() => navigator.userAgent));
    await browser.close();
    cachedUserAgent = deheadless(raw);
    return cachedUserAgent;
  } catch {
    cachedUserAgent = "";
    return undefined;
  }
}
