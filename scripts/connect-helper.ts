import { config } from "dotenv";
config({ path: ".env.local" });

import path from "node:path";
import { chromium, type BrowserContext } from "playwright";

/**
 * Operator CLI: connect Uber or Ola.
 *
 * Opens a real browser on your own machine, waits while you complete the
 * phone-and-OTP login, then posts the captured session to the app.
 *
 *   npx tsx scripts/connect-helper.ts uber
 *   npx tsx scripts/connect-helper.ts ola
 *
 * ## Why this launches real Chrome with no device emulation
 *
 * An earlier version used Playwright's `devices['Pixel 7']` preset. That
 * preset only changes the user agent, viewport and touch flags; it leaves
 * `navigator.platform` as Win32, the WebGL renderer as the host GPU, and
 * client hints empty. The result claims to be an Android phone while every
 * other signal says Windows desktop, and score-based bot detection reads that
 * contradiction directly — which is what produced endless captchas.
 *
 * Real Chrome, reporting honestly about the machine it is on, is entirely
 * self-consistent. That is the whole trick.
 *
 * The profile directory is persistent for the same reason: a browser with no
 * history, no cookies and no local storage is itself unusual. Reusing one
 * profile across attempts means the second try looks like a returning user
 * rather than a freshly minted one.
 *
 * Keep this in step with src/lib/fares/device.ts. It is duplicated rather than
 * imported because this script runs outside the Next.js module graph and
 * tsconfig excludes scripts/.
 */

const DEVICE_PROFILE_ID = "desktop-chrome-v2";
const PROFILE_DIR = path.resolve(".playwright-profiles");

const TARGETS = {
  uber: { url: "https://auth.uber.com/login/", label: "Uber" },
  ola: { url: "https://book.olacabs.com/", label: "Ola" },
} as const;

type ProviderKey = keyof typeof TARGETS;

/** Real Chrome first; bundled Chromium only where no Chrome build exists. */
async function pickChannel(): Promise<string | undefined> {
  const configured = process.env.FARE_BROWSER_CHANNEL?.trim();
  if (configured) return configured === "chromium" ? undefined : configured;

  for (const candidate of ["chrome", "msedge"]) {
    try {
      const probe = await chromium.launch({ channel: candidate, headless: true });
      await probe.close();
      return candidate;
    } catch {
      /* not installed */
    }
  }
  return undefined;
}

async function main() {
  const provider = process.argv[2] as ProviderKey | undefined;
  if (!provider || !(provider in TARGETS)) {
    console.error("Usage: npx tsx scripts/connect-helper.ts <uber|ola>");
    process.exit(1);
  }

  const appUrl = (process.env.CONNECT_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const token = process.env.CONNECT_TOKEN?.trim();
  if (!token) {
    console.error("CONNECT_TOKEN is not set in .env.local.");
    process.exit(1);
  }

  const channel = await pickChannel();
  const target = TARGETS[provider];

  console.log(`\nBrowser: ${channel ?? "bundled Chromium"}`);
  if (!channel) {
    console.log(
      "  Real Chrome was not found. Bundled Chromium is more likely to be challenged.",
    );
  }
  console.log(`Profile: ${path.join(PROFILE_DIR, provider)} (reused between runs)`);
  console.log(`\nOpening ${target.label}. Log in with the shared account.`);
  console.log("The browser stays open until you press Enter here.\n");

  // A persistent context, so the profile accumulates a normal browsing
  // history instead of looking brand new on every attempt.
  const context: BrowserContext = await chromium.launchPersistentContext(
    path.join(PROFILE_DIR, provider),
    {
      headless: false,
      ...(channel ? { channel } : {}),
      args: ["--disable-blink-features=AutomationControlled"],
      locale: "en-IN",
      timezoneId: "Asia/Kolkata",
      geolocation: { latitude: 12.9784, longitude: 77.6408 },
      permissions: ["geolocation"],
      viewport: null,
    },
  );

  const page = context.pages()[0] ?? (await context.newPage());
  await page.goto(target.url).catch(() => {
    console.log("(Initial navigation was interrupted; carry on in the browser.)");
  });

  await new Promise<void>((resolve) => {
    process.stdout.write("Press Enter once you are logged in… ");
    process.stdin.once("data", () => resolve());
  });

  const storageState = await context.storageState();
  const userAgent = await page.evaluate(() => navigator.userAgent).catch(() => undefined);
  const cookieCount = storageState.cookies.length;

  if (cookieCount === 0) {
    console.error("\nNo cookies were captured, so the login did not complete.");
    await context.close();
    process.exit(1);
  }

  console.log(`\nCaptured ${cookieCount} cookies. Sending to ${appUrl}…`);

  const response = await fetch(`${appUrl}/api/connect/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ provider, storageState, userAgent }),
  });

  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;

  if (!response.ok) {
    console.error(`\nImport failed (${response.status}):`, body.error ?? body);
    await context.close();
    process.exit(1);
  }

  console.log(`\n${target.label} connected. Device profile: ${DEVICE_PROFILE_ID}`);
  await context.close();
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
