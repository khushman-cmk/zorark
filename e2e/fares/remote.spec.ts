import { expect, test } from "@playwright/test";
import {
  authorise,
  getSession,
  start,
  status,
  stop,
} from "@/lib/fares/remote/screencast";

/**
 * Remote-login session lifecycle.
 *
 * The regression these guard against: `start()` used to tear down any existing
 * session before creating a new one. React strict mode double-invokes effects
 * in development, so the second invocation destroyed the session the first had
 * already handed a token to, and the client was left holding a token the
 * registry no longer recognised. Every subsequent call — the frame stream, every
 * input event, and Save — answered 401, so the screencast stayed blank and
 * saving appeared to do nothing.
 *
 * These launch a real browser, so they are serial and slow.
 */

test.describe("remote login session", () => {
  test.describe.configure({ mode: "serial", timeout: 180_000 });

  test.afterAll(async () => {
    await stop("rapido");
  });

  test("starting twice reuses the live session instead of replacing it", async () => {
    const first = await start("rapido");
    expect(first.token).toBeTruthy();

    // Exactly what strict mode does on mount.
    const second = await start("rapido");

    // Same session, same token: the client's token must stay valid.
    expect(second.token).toBe(first.token);
    expect(authorise("rapido", first.token)).not.toBeNull();
  });

  test("the token from the first start still authorises every action", async () => {
    const { token } = await start("rapido");

    // The frame stream, input relay and save all go through this one check.
    expect(authorise("rapido", token)).not.toBeNull();
    expect(authorise("rapido", token)).not.toBeNull();

    // A wrong token is refused, and refusal does not disturb the session.
    expect(authorise("rapido", "not-the-token")).toBeNull();
    expect(authorise("rapido", token)).not.toBeNull();
  });

  test("an explicit restart mints a new token and retires the old one", async () => {
    const first = await start("rapido");
    const restarted = await start("rapido", { restart: true });

    expect(restarted.token).not.toBe(first.token);
    expect(authorise("rapido", first.token)).toBeNull();
    expect(authorise("rapido", restarted.token)).not.toBeNull();
  });

  test("status reports a countdown while the session is live", async () => {
    await start("rapido");
    const snapshot = status("rapido");

    expect(snapshot.running).toBe(true);
    if (snapshot.running) {
      // The operator sees this, so the hard cap is never a surprise.
      expect(snapshot.expiresInSec).toBeGreaterThan(0);
      expect(snapshot.viewers).toBe(0);
    }
  });

  test("stopping clears the session and invalidates its token", async () => {
    const { token } = await start("rapido");
    await stop("rapido");

    expect(getSession("rapido")).toBeNull();
    expect(authorise("rapido", token)).toBeNull();
    expect(status("rapido").running).toBe(false);
  });
});
