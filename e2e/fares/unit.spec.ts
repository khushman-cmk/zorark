import { expect, test } from "@playwright/test";
import { seal, unseal, looksLikeStorageState } from "@/lib/fares/sessions/crypto";
import {
  money,
  fromE5,
  titleCase,
  isParcelProduct,
  secondsToMinutes,
  positiveOrNull,
  formatINR,
} from "@/lib/fares/money";
import { routeKey, straightLineKm, localityAndCity } from "@/lib/fares/route-key";
import { normalizeRapido, parseRapidoCard } from "@/lib/fares/providers/rapido.normalize";

/**
 * Pure unit tests: no browser, no network, no session.
 *
 * The spec calls this the only way to get real coverage of code paths that
 * otherwise require a live login, so most of the parsing logic is proved here
 * and the live suite only has to confirm the transport still works.
 */

test.describe("session sealing", () => {
  test("round-trips a session unchanged", () => {
    const plaintext = {
      storageState: { cookies: [{ name: "sid", value: "abc" }], origins: [] },
      authHeaders: { "x-token": "t" },
      deviceProfileId: "pixel7-chrome-v1",
    };

    const sealed = seal("uber", plaintext);
    const back = unseal("uber", sealed);

    expect(back).toEqual(plaintext);
    // The ciphertext must not be the plaintext with extra steps.
    expect(sealed.ciphertext.toString("utf8")).not.toContain("sid");
  });

  test("a blob sealed for one provider will not unseal as another", () => {
    const sealed = seal("uber", {
      storageState: { cookies: [] },
      deviceProfileId: "pixel7-chrome-v1",
    });

    // The provider name is the additional authenticated data, so this fails
    // the auth tag rather than quietly returning the wrong session.
    expect(() => unseal("ola", sealed)).toThrow();
  });

  test("each seal uses a fresh nonce", () => {
    const plaintext = { storageState: { cookies: [] }, deviceProfileId: "d" };
    const a = seal("ola", plaintext);
    const b = seal("ola", plaintext);
    expect(a.iv.equals(b.iv)).toBe(false);
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  test("rejects something that is not a storage state", () => {
    expect(looksLikeStorageState({ cookies: [] })).toBe(true);
    expect(looksLikeStorageState({ nope: true })).toBe(false);
    expect(looksLikeStorageState(null)).toBe(false);
    expect(looksLikeStorageState("cookies")).toBe(false);
  });
});

test.describe("money parsing", () => {
  test("strips grouping and currency", () => {
    expect(money("₹1,130")).toBe(1130);
    expect(money("Rs. 249.13")).toBe(249.13);
    expect(money("₹ 104")).toBe(104);
  });

  test("a blank fare is null, never zero", () => {
    // Treating blank as 0 would make an unpriced product win every
    // cheapest-fare comparison.
    expect(money("")).toBeNull();
    expect(money(null)).toBeNull();
    expect(money(undefined)).toBeNull();
    expect(money("—")).toBeNull();
  });

  test("converts Uber's hundred-thousandths", () => {
    expect(fromE5(24913000)).toBeCloseTo(249.13, 5);
    expect(fromE5(null)).toBeNull();
    expect(fromE5(undefined)).toBeNull();
  });

  test("identifies parcel products", () => {
    // These are package delivery, not rides. They are cheap and would
    // wrongly win a cheapest comparison.
    expect(isParcelProduct("Parcel Bike")).toBe(true);
    expect(isParcelProduct("Parcel Mini 3W")).toBe(true);
    expect(isParcelProduct("Uber Go AC", "Send packages across town")).toBe(true);
    expect(isParcelProduct("Courier Express")).toBe(true);
    expect(isParcelProduct("Uber Go AC", "Affordable compact AC rides")).toBe(false);
    expect(isParcelProduct("Premier")).toBe(false);
  });

  test("maps Ola's unknown ETA to null", () => {
    // eta.value === -1 means unknown; rendering it naively produces "-1 min".
    expect(positiveOrNull(-1)).toBeNull();
    expect(positiveOrNull(4)).toBe(4);
    expect(positiveOrNull(0)).toBe(0);
  });

  test("converts trip seconds to minutes", () => {
    expect(secondsToMinutes(2160)).toBe(36);
    expect(secondsToMinutes(null)).toBeNull();
  });

  test("title-cases a category id", () => {
    expect(titleCase("prime")).toBe("Prime");
    expect(titleCase("prime_sedan")).toBe("Prime Sedan");
  });

  test("formats rupees with Indian grouping", () => {
    expect(formatINR(1250)).toBe("₹1,250");
    expect(formatINR(125000)).toBe("₹1,25,000");
    expect(formatINR(249.13)).toBe("₹249.13");
    expect(formatINR(340)).toBe("₹340");
  });
});

test.describe("route keys", () => {
  test("nearby points collapse to one cache row", () => {
    const a = routeKey(
      { latitude: 12.97836, longitude: 77.64083 },
      { latitude: 12.93524, longitude: 77.62453 },
    );
    // ~5 m away: same grid cell, so twenty users on one route cost the
    // shared account a single request.
    const b = routeKey(
      { latitude: 12.978365, longitude: 77.640835 },
      { latitude: 12.935245, longitude: 77.624535 },
    );
    expect(a).toBe(b);
  });

  test("distinct routes do not collide", () => {
    const a = routeKey(
      { latitude: 12.9783, longitude: 77.6408 },
      { latitude: 12.9352, longitude: 77.6245 },
    );
    const b = routeKey(
      { latitude: 28.6139, longitude: 77.209 },
      { latitude: 28.5245, longitude: 77.1855 },
    );
    expect(a).not.toBe(b);
  });

  test("measures the straight-line distance", () => {
    const km = straightLineKm(
      { latitude: 12.9783692, longitude: 77.6408356 },
      { latitude: 12.9352403, longitude: 77.624532 },
    );
    expect(km).toBeGreaterThan(4);
    expect(km).toBeLessThan(6);
  });

  test("splits an address into locality and city", () => {
    expect(
      localityAndCity({
        latitude: 0,
        longitude: 0,
        address: "Indiranagar, Bengaluru, Karnataka, India",
        name: "Indiranagar",
      }),
    ).toEqual({ locality: "Indiranagar", city: "Bengaluru" });

    // Too coarse to derive a route from.
    expect(localityAndCity({ latitude: 0, longitude: 0, address: "India" })).toBeNull();
  });
});

test.describe("rapido normalizer", () => {
  test("quotes the low end of a range and keeps the range as a note", () => {
    const option = parseRapidoCard("Auto ₹ 104 - ₹ 125");
    expect(option).not.toBeNull();
    expect(option!.name).toBe("Auto");
    // Quoting the high end makes Rapido look uncompetitive; a midpoint would
    // invent a number the platform never stated.
    expect(option!.price).toBe(104);
    expect(option!.priceNote).toContain("104");
    expect(option!.priceNote).toContain("125");
  });

  test("handles a single price with no range", () => {
    const option = parseRapidoCard("Bike ₹ 45");
    expect(option!.price).toBe(45);
    expect(option!.priceNote).toBeNull();
  });

  test("drops unparseable cards and de-duplicates", () => {
    const options = normalizeRapido([
      "Auto ₹ 104 - ₹ 125",
      "Loading...",
      "Auto ₹ 104 - ₹ 125",
      "Cab Economy ₹ 206 - ₹ 251",
      "",
    ]);
    expect(options.map((o) => o.name)).toEqual(["Auto", "Cab Economy"]);
  });
});
