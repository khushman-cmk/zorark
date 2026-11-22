import { z } from "zod";
import { getDirections } from "@/lib/safety/directions";
import { safetyErrorResponse } from "@/lib/safety/http";

/**
 * Fastest vs safest directions between two points in Delhi NCR.
 *
 * Public like the fare search: routing reveals nothing about the caller, and
 * the heavy lifting happens in the local GraphHopper server.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const point = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  label: z.string().max(200).optional(),
});

const bodySchema = z.object({ from: point, to: point });

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Send from and to as {lat, lng}", code: "INVALID" }, { status: 400 });
  }
  const { from, to } = parsed.data;
  try {
    const data = await getDirections([from.lng, from.lat], [to.lng, to.lat], request.signal);
    return Response.json({ data });
  } catch (err) {
    return safetyErrorResponse(err, "[directions]");
  }
}
