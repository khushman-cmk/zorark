/**
 * Server boot hook.
 *
 * Starts the fare-session health prober exactly once per Node process. The
 * prober guards itself further with a globalThis flag and a database advisory
 * lock, because hot reload re-evaluates modules and a multi-process deploy
 * would otherwise probe several times over.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startHealthProber } = await import("@/lib/fares/sessions/health");
  startHealthProber();

  // Load the safety grid and touch the routing engine in the background so the
  // first directions request is fast. warmSafety never throws.
  const { warmSafety } = await import("@/lib/safety/directions");
  void warmSafety();
}
