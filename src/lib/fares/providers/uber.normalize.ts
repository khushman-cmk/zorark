import { fromE5, isParcelProduct, money, secondsToMinutes } from "../money";
import type { FareOption } from "../types";

/**
 * Uber's Products GraphQL response, reduced to the fields we read.
 * Everything is optional because this is an undocumented API that changes
 * without notice; the normalizer has to survive a missing field, not crash.
 */
export type UberFare = {
  fare?: string | null;
  fareAmountE5?: number | null;
  capacity?: number | null;
  hasPromo?: boolean | null;
  hasRidePass?: boolean | null;
  preAdjustmentValue?: string | null;
  discountPrimary?: string | null;
  meta?: string | null;
};

export type UberProduct = {
  displayName?: string | null;
  detailedDescription?: string | null;
  currencyCode?: string | null;
  etaStringShort?: string | null;
  etaInMin?: number | null;
  estimatedTripTime?: number | null;
  fares?: UberFare[] | null;
};

export type UberProductsResponse = {
  data?: {
    products?: {
      tiers?: { title?: string | null; products?: UberProduct[] | null }[] | null;
    } | null;
  } | null;
};

function allProducts(json: UberProductsResponse) {
  const tiers = json.data?.products?.tiers ?? [];
  return tiers.flatMap((tier) =>
    (tier.products ?? []).map((product) => ({ tier: tier.title ?? null, product })),
  );
}

/**
 * True when Uber answered with a real catalogue but every price is blank.
 *
 * Logged out you get 36 products across 3 tiers with `fare: ""`,
 * `fareAmountE5: null` and `targetProductType":"ANONYMOUS"` in each fare's
 * meta. Detect this exact state and refuse to emit prices — never treat a
 * blank fare as zero, or an unpriced product wins every comparison.
 */
export function isAnonymousResponse(json: UberProductsResponse): boolean {
  const entries = allProducts(json);
  if (entries.length === 0) return false;

  const fares = entries.flatMap((e) => e.product.fares ?? []);
  if (fares.length === 0) return false;

  const anyPriced = fares.some((f) => typeof f.fareAmountE5 === "number");
  if (anyPriced) return false;

  const anonymousMarker = fares.some((f) =>
    (f.meta ?? "").includes('targetProductType\\":\\"ANONYMOUS') ||
    (f.meta ?? "").includes('"targetProductType":"ANONYMOUS'),
  );
  // Either marker or a wholly unpriced catalogue means we have no session.
  return anonymousMarker || !anyPriced;
}

/** True when at least one fare carries a real number. Used to prefer the
 *  priced response when Products fires twice. */
export function hasPricedFare(json: UberProductsResponse): boolean {
  return allProducts(json).some((e) =>
    (e.product.fares ?? []).some((f) => typeof f.fareAmountE5 === "number"),
  );
}

export function normalizeUber(json: UberProductsResponse): FareOption[] {
  const options: FareOption[] = [];

  for (const { tier, product } of allProducts(json)) {
    const name = product.displayName?.trim();
    if (!name) continue;

    // Package delivery, not rides. Cheap enough to wrongly win a
    // "cheapest" comparison if left in.
    if (isParcelProduct(name, product.detailedDescription)) continue;

    const fare = (product.fares ?? [])[0];
    if (!fare) continue;

    const quoted = fromE5(fare.fareAmountE5) ?? money(fare.fare);
    if (quoted === null) continue;

    // Promo correction. One account answers everyone's queries, so its
    // loyalty perks would silently discount every visitor's quote. Uber
    // exposes the pre-adjustment value per fare, so we headline the
    // undiscounted price and keep the account's own price beside it.
    const undiscounted = money(fare.preAdjustmentValue);
    const perked = Boolean(fare.hasPromo || fare.hasRidePass);
    const headline = perked && undiscounted !== null ? undiscounted : quoted;

    options.push({
      name,
      category: tier,
      price: headline,
      accountPrice: headline !== quoted ? quoted : null,
      discountNote:
        headline !== quoted
          ? fare.discountPrimary?.trim() ||
            (fare.hasRidePass ? "Ride pass on the connected account" : "Promo on the connected account")
          : null,
      priceNote: null,
      currency: product.currencyCode?.trim() || "INR",
      etaText: product.etaStringShort?.trim() || null,
      durationMin:
        secondsToMinutes(product.estimatedTripTime) ??
        (typeof product.etaInMin === "number" ? product.etaInMin : null),
      capacity: typeof fare.capacity === "number" ? fare.capacity : null,
    });
  }

  return options;
}
