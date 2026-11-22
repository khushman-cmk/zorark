import type { Browser, BrowserContext, Page } from "playwright";
import { chromium } from "playwright";
import { fareConfig } from "./config";
import { CONTEXT_OPTIONS, defaultUserAgent, deheadless, launchOptions } from "./device";
import type { ProviderId } from "./types";

/**
 * One Chromium for the whole server, shared by every adapter.
 *
 * Held on globalThis rather than in a module-scope variable because Turbopack
 * re-evaluates modules on hot reload in development; a plain `let` would leak
 * a browser process on every edit until the machine ran out of them.
 */

type BrowserSlot = {
  browser: Browser | null;
  launching: Promise<Browser> | null;
  contexts: Map<ProviderId, BrowserContext>;
};

const GLOBAL_KEY = Symbol.for("zippi.fares.browser");

function slot(): BrowserSlot {
  const g = globalThis as unknown as Record<symbol, BrowserSlot | undefined>;
  if (!g[GLOBAL_KEY]) {
    g[GLOBAL_KEY] = { browser: null, launching: null, contexts: new Map() };
  }
  return g[GLOBAL_KEY]!;
}

export async function getBrowser(): Promise<Browser> {
  const s = slot();
  if (s.browser?.isConnected()) return s.browser;

  // A second caller during launch awaits the same promise rather than
  // starting a competing browser.
  if (!s.launching) {
    s.launching = launchOptions(!fareConfig.headful)
      .then((options) => chromium.launch(options))
      .then((browser) => {
        s.browser = browser;
        browser.on("disconnected", () => {
          s.browser = null;
          s.contexts.clear();
        });
        return browser;
      })
      .finally(() => {
        s.launching = null;
      });
  }
  return s.launching;
}

/**
 * A context per provider, so cookie jars never mix. `storageState` seeds a
 * connected session; omit it for anonymous providers like Rapido.
 */
export async function getContext(
  provider: ProviderId,
  storageState?: Parameters<Browser["newContext"]>[0] extends infer O
    ? O extends { storageState?: infer S }
      ? S
      : never
    : never,
  userAgent?: string,
): Promise<BrowserContext> {
  const s = slot();
  const existing = s.contexts.get(provider);
  if (existing) return existing;

  const browser = await getBrowser();
  // Replay the user agent that minted the session, so cookies are never sent
  // under a different identity. Falling back to this host's own, with the
  // headless marker stripped: HeadlessChrome in the UA is a blunt tell.
  const ua = userAgent ? deheadless(userAgent) : await defaultUserAgent();
  const context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    ...(ua ? { userAgent: ua } : {}),
    ...(storageState ? { storageState } : {}),
  });
  context.on("close", () => {
    if (s.contexts.get(provider) === context) s.contexts.delete(provider);
  });
  s.contexts.set(provider, context);
  return context;
}

/** Drops a provider's context, e.g. after importing a fresh session. */
export async function invalidateContext(provider: ProviderId): Promise<void> {
  const s = slot();
  const context = s.contexts.get(provider);
  s.contexts.delete(provider);
  await context?.close().catch(() => {});
}

/** Reads the live cookie jar back out, for session write-back. */
export async function currentStorageState(provider: ProviderId) {
  const context = slot().contexts.get(provider);
  if (!context) return null;
  return context.storageState().catch(() => null);
}

/** Runs a function against a fresh page, always tearing the page down. */
export async function withPage<T>(
  provider: ProviderId,
  fn: (page: Page) => Promise<T>,
  storageState?: Parameters<typeof getContext>[1],
  userAgent?: string,
): Promise<T> {
  const context = await getContext(provider, storageState, userAgent);
  const page = await context.newPage();
  page.setDefaultTimeout(fareConfig.pageTimeoutMs);
  page.setDefaultNavigationTimeout(fareConfig.pageTimeoutMs);
  try {
    return await fn(page);
  } finally {
    await page.close().catch(() => {});
  }
}

/** Shuts everything down. Used by tests and by graceful shutdown. */
export async function closeBrowser(): Promise<void> {
  const s = slot();
  const browser = s.browser;
  s.browser = null;
  s.contexts.clear();
  await browser?.close().catch(() => {});
}
