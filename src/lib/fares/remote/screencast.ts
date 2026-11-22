import { randomBytes, timingSafeEqual } from "node:crypto";
import { chromium, type Browser, type BrowserContext, type CDPSession, type Page } from "playwright";
import { browserChannel, CONTEXT_OPTIONS, DEVICE_PROFILE_ID, LAUNCH_ARGS } from "../device";
import type { ProviderId } from "../types";

/**
 * In-browser remote login.
 *
 * The operator drives a browser that lives on the server, so the session is
 * minted and replayed from the same IP. That removes the residential-to-server
 * IP switch that the import path cannot avoid, which is exactly the signal
 * fraud systems watch for.
 *
 * Frames go down over SSE and input comes back up over POST. An OTP form is a
 * handful of clicks and about sixteen keystrokes, so one HTTP round trip per
 * event is imperceptible and there is no reason to add a WebSocket server.
 */

// Fixed on both sides so client offsetX/offsetY map 1:1 onto page coordinates:
// no scale factor, no scroll reconciliation, no coordinate maths at all.
export const VIEWPORT = { width: 420, height: 880 } as const;

/** Nobody gets to drive the server's browser to a page of their choosing. */
const ALLOWLIST: Record<ProviderId, string[]> = {
  uber: ["uber.com", "m.uber.com", "auth.uber.com", "cn-geo1.uber.com"],
  ola: ["olacabs.com", "book.olacabs.com", "www.olacabs.com"],
  rapido: ["rapido.bike", "m.rapido.bike"],
};

const START_URL: Record<ProviderId, string> = {
  uber: "https://auth.uber.com/login/",
  ola: "https://book.olacabs.com/",
  rapido: "https://m.rapido.bike/",
};

/** Hard cap, honoured regardless of activity: this is an interactive browser
 *  on a public box. Configurable because a real OTP round trip can be slow. */
const ABSOLUTE_TTL_MS = Number(process.env.FARE_REMOTE_MAX_MS ?? 10 * 60_000);
/** Idle cap. Refreshed by input *and* by an attached viewer, because waiting
 *  for a verification SMS involves neither clicks nor keystrokes. */
const IDLE_TTL_MS = Number(process.env.FARE_REMOTE_IDLE_MS ?? 5 * 60_000);
const MAX_INPUT_PER_SEC = 50;

type Subscriber = (frame: string) => void;

type RemoteSession = {
  provider: ProviderId;
  token: string;
  browser: Browser;
  context: BrowserContext;
  page: Page;
  cdp: CDPSession;
  subscribers: Set<Subscriber>;
  lastFrame: string | null;
  createdAt: number;
  lastActivity: number;
  inputWindowStart: number;
  inputCount: number;
  killTimer: NodeJS.Timeout;
};

const GLOBAL_KEY = Symbol.for("zippi.fares.remote");

function registry(): Map<ProviderId, RemoteSession> {
  const g = globalThis as unknown as Record<symbol, Map<ProviderId, RemoteSession> | undefined>;
  if (!g[GLOBAL_KEY]) g[GLOBAL_KEY] = new Map();
  return g[GLOBAL_KEY]!;
}

export function tokenMatches(session: RemoteSession, presented: string): boolean {
  const a = Buffer.from(presented);
  const b = Buffer.from(session.token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function getSession(provider: ProviderId): RemoteSession | null {
  return registry().get(provider) ?? null;
}

/** Verifies the ephemeral token and refreshes the idle clock. */
export function authorise(provider: ProviderId, token: string): RemoteSession | null {
  const session = getSession(provider);
  if (!session) return null;
  if (!tokenMatches(session, token)) return null;

  const now = Date.now();
  if (now - session.lastActivity > IDLE_TTL_MS) {
    void stop(provider);
    return null;
  }
  session.lastActivity = now;
  return session;
}

export async function start(
  provider: ProviderId,
  opts: { restart?: boolean } = {},
): Promise<{ token: string; url: string }> {
  // Get-or-create, not always-create. React strict mode double-invokes effects
  // in development, so tearing down unconditionally here destroyed the session
  // the first invocation had already handed to the client and left it holding
  // a token the registry no longer knew about — a 401 on everything after.
  const existing = getSession(provider);
  if (existing && !opts.restart) {
    const idle = Date.now() - existing.lastActivity;
    if (idle < IDLE_TTL_MS) {
      existing.lastActivity = Date.now();
      return { token: existing.token, url: existing.page.url() || START_URL[provider] };
    }
  }

  await stop(provider);

  // Real Chrome where it exists. The bundled Chromium differs from it in ways
  // detection notices, and these login pages are exactly where that matters.
  const channel = await browserChannel();

  const browser = await chromium.launch({
    // Headless is markedly more detectable, and these logins carry
    // score-based reCAPTCHA plus bot-management layers that silently fail a
    // bot-like score. On Linux this needs a real display: run Xvfb as its own
    // long-lived service and set DISPLAY in the app environment.
    headless: false,
    args: [...LAUNCH_ARGS],
    ...(channel ? { channel } : {}),
  });

  const context = await browser.newContext({
    ...CONTEXT_OPTIONS,
    viewport: { ...VIEWPORT },
    acceptDownloads: false,
  });

  const page = await context.newPage();

  // Hard navigation allowlist, enforced at the network layer. Nobody gets to
  // drive the server's browser to a page of their choosing.
  const allowed = ALLOWLIST[provider];
  await context.route("**/*", async (route) => {
    const request = route.request();

    let topLevelNavigation = false;
    try {
      // request.frame() throws for service-worker requests and for frames that
      // have already detached. Neither is a top-level navigation, but letting
      // the throw escape rejects the route handler and stalls the page.
      topLevelNavigation =
        request.isNavigationRequest() && request.frame() === page.mainFrame();
    } catch {
      topLevelNavigation = false;
    }

    if (topLevelNavigation) {
      let host: string | null = null;
      try {
        host = new URL(request.url()).hostname;
      } catch {
        host = null;
      }
      const ok =
        host !== null && allowed.some((d) => host === d || host.endsWith(`.${d}`));
      if (!ok) {
        await route.abort("blockedbyclient").catch(() => {});
        return;
      }
    }

    // Racing with a page close can reject this; it is not actionable.
    await route.continue().catch(() => {});
  });

  const cdp = await context.newCDPSession(page);

  const session: RemoteSession = {
    provider,
    token: randomBytes(32).toString("base64url"),
    browser,
    context,
    page,
    cdp,
    subscribers: new Set(),
    lastFrame: null,
    createdAt: Date.now(),
    lastActivity: Date.now(),
    inputWindowStart: Date.now(),
    inputCount: 0,
    // Hard kill regardless of activity: this is an interactive browser on a
    // public box.
    killTimer: setTimeout(() => void stop(provider), ABSOLUTE_TTL_MS),
  };

  cdp.on("Page.screencastFrame", async ({ data, sessionId }) => {
    session.lastFrame = data;
    // Someone is watching, so the session is in use even if they have not
    // clicked for minutes while a verification SMS arrives.
    if (session.subscribers.size > 0) session.lastActivity = Date.now();
    for (const send of session.subscribers) {
      try {
        send(data);
      } catch {
        /* a dropped subscriber is cleaned up by its own teardown */
      }
    }
    // Acking is what makes the next frame arrive.
    await cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
  });

  await cdp.send("Page.startScreencast", {
    format: "jpeg",
    quality: 60,
    maxWidth: VIEWPORT.width,
    maxHeight: VIEWPORT.height,
    everyNthFrame: 2,
  });

  registry().set(provider, session);

  await page.goto(START_URL[provider], { waitUntil: "domcontentloaded" }).catch(() => {});

  return { token: session.token, url: START_URL[provider] };
}

export function subscribe(session: RemoteSession, send: Subscriber): () => void {
  session.subscribers.add(send);
  session.lastActivity = Date.now();
  // Paint immediately rather than waiting for the next change-driven frame.
  if (session.lastFrame) send(session.lastFrame);
  return () => session.subscribers.delete(send);
}

export type RemoteInput =
  | { type: "click"; x: number; y: number; button?: "left" | "right" | "middle" }
  | { type: "wheel"; dx: number; dy: number }
  | { type: "text"; text: string }
  | { type: "key"; key: string };

export async function relayInput(
  session: RemoteSession,
  event: RemoteInput,
): Promise<void> {
  const now = Date.now();
  if (now - session.inputWindowStart > 1000) {
    session.inputWindowStart = now;
    session.inputCount = 0;
  }
  if (++session.inputCount > MAX_INPUT_PER_SEC) {
    throw new Error("Too many input events");
  }

  // CDP delivers the frames, but input goes through the automation API: it
  // handles focus, IME and composition properly, and insertText makes pasting
  // an OTP trivial.
  const page = session.page;
  switch (event.type) {
    case "click":
      await page.mouse.click(event.x, event.y, { button: event.button ?? "left" });
      break;
    case "wheel":
      await page.mouse.wheel(event.dx, event.dy);
      break;
    case "text":
      await page.keyboard.insertText(event.text);
      break;
    case "key":
      await page.keyboard.press(event.key);
      break;
  }
}

/** Captures the logged-in session and tears the browser down. */
export async function save(session: RemoteSession): Promise<{
  storageState: unknown;
  cookies: number;
  deviceProfileId: string;
  userAgent?: string;
}> {
  const storageState = await session.context.storageState();
  // Captured so the HTTP path replays cookies under the identity that minted
  // them rather than a different one.
  const userAgent = await session.page
    .evaluate(() => navigator.userAgent)
    .catch(() => undefined);
  const cookies = storageState.cookies.length;
  await stop(session.provider);
  return { storageState, cookies, deviceProfileId: DEVICE_PROFILE_ID, userAgent };
}

export async function stop(provider: ProviderId): Promise<void> {
  const session = registry().get(provider);
  if (!session) return;
  registry().delete(provider);

  clearTimeout(session.killTimer);
  session.subscribers.clear();
  await session.cdp.send("Page.stopScreencast").catch(() => {});
  await session.context.close().catch(() => {});
  await session.browser.close().catch(() => {});
}

export function status(provider: ProviderId) {
  const session = getSession(provider);
  if (!session) return { running: false as const };
  return {
    running: true as const,
    startedAt: session.createdAt,
    expiresInSec: Math.max(
      0,
      Math.round((session.createdAt + ABSOLUTE_TTL_MS - Date.now()) / 1000),
    ),
    viewers: session.subscribers.size,
    url: session.page.url(),
  };
}
