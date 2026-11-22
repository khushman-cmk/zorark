import { SafetyError } from "./graphhopper";

/** Map safe-routing failures onto the `{ error, code }` JSON the UI understands. */
export function safetyErrorResponse(err: unknown, tag: string): Response {
  if (err instanceof SafetyError) {
    return Response.json({ error: err.message, code: err.code }, { status: err.status });
  }
  if (err instanceof Response) return err;
  // An aborted request is the client navigating away, not a fault.
  if (err instanceof Error && err.name === "AbortError") return new Response(null, { status: 499 });
  console.error(tag, err);
  return Response.json({ error: "Safe routing hit an unexpected error", code: "ENGINE_ERROR" }, { status: 500 });
}
