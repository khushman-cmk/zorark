import { safetyStatus } from "@/lib/safety/directions";

/**
 * Is safe routing ready? The UI uses this to show an "engine offline" or
 * "data out of date" banner, and the API tests use it to skip when the
 * routing engine is not running.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const data = await safetyStatus(request.signal);
  return Response.json({ data }, { headers: { "Cache-Control": "no-store" } });
}
