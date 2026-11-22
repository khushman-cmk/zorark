import { z } from "zod";
import { autocomplete, geocodePlaceId } from "@/lib/fares/geocode";

/**
 * Place search and resolution for the fare comparison UI.
 *
 * Public and unauthenticated, matching the upstream endpoints it proxies. It
 * exists rather than calling Rapido from the browser so the origin/referer
 * headers stay correct and the client never learns which vendor geocodes.
 */

export const runtime = "nodejs";

const searchSchema = z.object({
  q: z.string().min(2).max(120),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
});

const resolveSchema = z.object({
  placeId: z.string().min(3).max(400),
  name: z.string().max(200).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const params = Object.fromEntries(url.searchParams);

    // Resolve mode: a place ID becomes coordinates.
    if (params.placeId) {
      const parsed = resolveSchema.safeParse(params);
      if (!parsed.success) {
        return Response.json({ error: "Invalid query" }, { status: 400 });
      }
      const coord = await geocodePlaceId(parsed.data.placeId, parsed.data.name);
      if (!coord) {
        return Response.json({ error: "Could not resolve that place" }, { status: 404 });
      }
      return Response.json({ data: coord });
    }

    // Search mode.
    const parsed = searchSchema.safeParse(params);
    if (!parsed.success) {
      return Response.json({ error: "Invalid query" }, { status: 400 });
    }
    const near =
      parsed.data.lat !== undefined && parsed.data.lng !== undefined
        ? { latitude: parsed.data.lat, longitude: parsed.data.lng }
        : undefined;

    const suggestions = await autocomplete(parsed.data.q, near, request.signal);
    return Response.json({ data: suggestions });
  } catch (err) {
    if (err instanceof Response) return err;
    // An aborted request is the client navigating away, not a fault.
    if (err instanceof Error && err.name === "AbortError") {
      return new Response(null, { status: 499 });
    }
    console.error("[fares/geocode]", err);
    return Response.json({ error: "Geocoding is unavailable" }, { status: 502 });
  }
}
