import { expect, request as playwrightRequest, test, type APIRequestContext } from "@playwright/test";
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { potholeReports } from "@/lib/schema";
import type { DirectionsResponse } from "@/lib/safety/types";

/**
 * Safe-routing API against the running app + GraphHopper.
 *
 * Runs once (desktop project) and skips when the routing engine is not up,
 * so the rest of the suite still runs on a machine without Java.
 */

const KOTLA = { from: { lat: 28.58039, lng: 77.21501 }, to: { lat: 28.56901, lng: 77.23139 } };
const TUGHLAKABAD = { from: { lat: 28.51495, lng: 77.27621 }, to: { lat: 28.51025, lng: 77.25779 } };
// The pothole test drops a pin on this route; it is used nowhere else so the
// pin (cached server-side for up to 30 s) cannot disturb the other checks.
const MUNIRKA = { from: { lat: 28.56495, lng: 77.15907 }, to: { lat: 28.54485, lng: 77.18313 } };

async function directions(request: APIRequestContext, body: unknown) {
  const res = await request.post("/api/directions", { data: body });
  return { status: res.status(), json: (await res.json()) as { data?: DirectionsResponse; code?: string } };
}

test.beforeEach(async ({ request }, testInfo) => {
  test.skip(testInfo.project.name !== "desktop", "API checks run once, on the desktop project");
  const status = (await (await request.get("/api/safety/status")).json()) as { data?: { engine?: { up?: boolean } } };
  test.skip(!status.data?.engine?.up, "routing engine not running (npm run gh:start)");
});

test("rejects malformed bodies and points outside NCR", async ({ request }) => {
  expect((await directions(request, { from: "here" })).status).toBe(400);
  const outside = await directions(request, { from: { lat: 19.076, lng: 72.877 }, to: KOTLA.to });
  expect(outside.status).toBe(422);
  expect(outside.json.code).toBe("OUT_OF_AREA");
});

for (const [name, route] of [["Kotla Mubarakpur", KOTLA], ["Tughlakabad", TUGHLAKABAD]] as const) {
  test(`safest route avoids the unplanned lanes of ${name}`, async ({ request }) => {
    const { status, json } = await directions(request, route);
    expect(status).toBe(200);
    const d = json.data!;
    expect(d.sameRoute).toBe(false);
    expect(d.fastest.stretches.some((s) => s.kinds.includes("unplanned"))).toBe(true);
    expect(d.safest.safety.riskyM).toBeLessThan(d.fastest.safety.riskyM * 0.6);
    expect(d.safest.safety.score).toBeGreaterThan(d.fastest.safety.score);
    // The detour stays reasonable.
    expect(d.safest.timeS).toBeLessThanOrEqual(d.fastest.timeS * 1.35 + 60);
    expect(d.meta.stale).toBe(false);
  });
}

test("bridges never carry a water penalty", async () => {
  // Straight from GraphHopper: the Yamuna crossing between ITO and Laxmi Nagar.
  const gh = await playwrightRequest.newContext({ baseURL: process.env.GRAPHHOPPER_URL || "http://localhost:8989" });
  const res = await gh.post("/route", {
    data: {
      profile: "car_safe",
      points: [[77.24, 28.63], [77.295, 28.627]],
      points_encoded: false,
      instructions: false,
      details: ["road_environment", "hike_rating"],
    },
  });
  expect(res.ok()).toBe(true);
  const path = (await res.json()).paths[0];
  const bridges: Array<[number, number, string]> = path.details.road_environment.filter(
    (d: [number, number, string]) => d[2] === "bridge",
  );
  expect(bridges.length, "the route should cross the river on a bridge").toBeGreaterThan(0);
  const water: Array<[number, number, number]> = path.details.hike_rating;
  for (const [bFrom, bTo] of bridges) {
    for (const [wFrom, wTo, band] of water) {
      if (band > 0) expect(wTo <= bFrom || wFrom >= bTo, `water band on bridge segment ${bFrom}-${bTo}`).toBe(true);
    }
  }
  await gh.dispose();
});

test.describe("pothole reports", () => {
  const created: string[] = [];

  test.afterAll(async () => {
    if (created.length) await db.delete(potholeReports).where(inArray(potholeReports.id, created));
  });

  test("need a signed-in rider", async ({ baseURL }) => {
    // newContext() inherits the project's signed-in storageState unless told otherwise.
    const anon = await playwrightRequest.newContext({ baseURL, storageState: { cookies: [], origins: [] } });
    const res = await anon.post("/api/potholes", { data: { lat: 28.575, lng: 77.22, severity: 2 } });
    expect(res.status()).toBe(401);
    await anon.dispose();
  });

  test("snap to the road, dedupe, and reroute the safest route", async ({ request }) => {
    const before = (await directions(request, MUNIRKA)).json.data!;
    const line = before.safest.geometry;
    const [lng, lat] = line[Math.floor(line.length / 2)];

    const first = await request.post("/api/potholes", { data: { lat, lng, severity: 3, note: "e2e test" } });
    expect([200, 201]).toContain(first.status());
    const report = (await first.json()).data;
    created.push(report.pothole.id);
    expect(report.pothole.severity).toBe(3);

    // A second pin from the same rider a few metres away confirms nothing new.
    const again = await request.post("/api/potholes", { data: { lat: lat + 0.00003, lng, severity: 1 } });
    expect(again.status()).toBe(200);
    const dup = (await again.json()).data;
    expect(dup.deduped).toBe(true);
    expect(dup.alreadyConfirmed).toBe(true);
    expect(dup.pothole.id).toBe(report.pothole.id);

    const listed = await request.get(`/api/potholes?bbox=${lng - 0.01},${lat - 0.01},${lng + 0.01},${lat + 0.01}`);
    expect(((await listed.json()).data as Array<{ id: string }>).map((p) => p.id)).toContain(report.pothole.id);

    const after = (await directions(request, MUNIRKA)).json.data!;
    expect(after.meta.potholeReroute).toBe(true);
    expect(after.potholes.map((p) => p.id)).toContain(report.pothole.id);
    // Either the safest route now avoids it, or it is flagged on the route.
    const avoided = after.safest.safety.potholeCount === 0;
    const flagged = after.safest.stretches.some((s) => s.kinds.includes("pothole"));
    expect(avoided || flagged).toBe(true);
  });

  test("reject pins far from any road", async ({ request }) => {
    // The middle of the Yamuna floodplain east of Nizamuddin.
    const res = await request.post("/api/potholes", { data: { lat: 28.5905, lng: 77.2665, severity: 1 } });
    expect(res.status()).toBe(422);
    expect((await res.json()).code).toBe("TOO_FAR_FROM_ROAD");
  });
});
