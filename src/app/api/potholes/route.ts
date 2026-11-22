import { z } from "zod";
import { getSafetyConfig, inRegion } from "@/lib/safety/config";
import { ghNearest, SafetyError } from "@/lib/safety/graphhopper";
import { safetyErrorResponse } from "@/lib/safety/http";
import { potholesIn, reportPothole } from "@/lib/safety/potholes";
import { getSession } from "@/lib/session";

/**
 * Crowd-sourced pothole reports.
 *
 * GET is public (the pins are shown to everyone). POST needs a signed-in
 * rider: reports are snapped to the nearest road, merged with any active
 * report a few metres away, and rate-limited per rider per day.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bboxSchema = z
  .string()
  .transform((s) => s.split(",").map(Number))
  .pipe(z.tuple([z.number(), z.number(), z.number(), z.number()]))
  .refine(([w, s, e, n]) => w < e && s < n && e - w <= 1 && n - s <= 1, "bbox must be west,south,east,north within 1°");

const reportSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  severity: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  note: z.string().trim().max(280).optional(),
});

export async function GET(request: Request) {
  const parsed = bboxSchema.safeParse(new URL(request.url).searchParams.get("bbox") ?? "");
  if (!parsed.success) {
    return Response.json({ error: "Pass bbox=west,south,east,north", code: "INVALID" }, { status: 400 });
  }
  try {
    const data = await potholesIn(parsed.data, getSafetyConfig());
    return Response.json({ data });
  } catch (err) {
    return safetyErrorResponse(err, "[potholes:get]");
  }
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session?.user?.id) {
    return Response.json({ error: "Sign in to report a pothole", code: "UNAUTHENTICATED" }, { status: 401 });
  }
  const parsed = reportSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return Response.json({ error: "Send lat, lng and a severity of 1–3", code: "INVALID" }, { status: 400 });
  }
  const { lat, lng, severity, note } = parsed.data;
  const cfg = getSafetyConfig();
  try {
    if (!inRegion(lng, lat, cfg)) {
      throw new SafetyError("OUT_OF_AREA", `Reports are collected in ${cfg.region.name} only`, 422);
    }
    const snapped = await ghNearest(lng, lat, request.signal);
    if (snapped.distanceM > cfg.potholes.snapMaxM) {
      throw new SafetyError("TOO_FAR_FROM_ROAD", "Tap on the road where the pothole is", 422);
    }
    const result = await reportPothole(
      { userId: session.user.id, rawLat: lat, rawLng: lng, lat: snapped.lat, lng: snapped.lng, severity, note },
      cfg,
    );
    return Response.json({ data: result }, { status: result.deduped ? 200 : 201 });
  } catch (err) {
    return safetyErrorResponse(err, "[potholes:post]");
  }
}
