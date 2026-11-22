/**
 * Money and text parsing shared by all three normalizers.
 *
 * Every provider states prices differently: Uber gives an integer in
 * hundred-thousandths plus a formatted string, Ola gives "₹1,130", Rapido
 * gives a range like "₹ 104 - ₹ 125". These helpers are pure so the
 * normalizers stay testable with no browser and no session.
 */

/**
 * Pulls a number out of a currency string. Strips grouping commas first, then
 * takes the first run of digits, so "₹1,130" and "Rs. 249.13" both work.
 * Returns null for empty, missing or unparseable input — never 0, because a
 * blank fare means "no price available", not "free".
 */
export function money(input: string | null | undefined): number | null {
  if (!input) return null;
  // Must start on a digit: a bare /[\d.]+/ matches the "." in "Rs." first.
  const match = input.replace(/,/g, "").match(/\d[\d.]*/);
  if (!match) return null;
  const value = Number.parseFloat(match[0]);
  return Number.isFinite(value) ? value : null;
}

/** Uber states fares as integer hundred-thousandths: 24913000 -> 249.13. */
export function fromE5(amount: number | null | undefined): number | null {
  if (typeof amount !== "number" || !Number.isFinite(amount)) return null;
  return amount / 1e5;
}

/** "prime" -> "Prime". Used when Ola's availability call fails and we still
 *  need a display name for the category. */
export function titleCase(input: string): string {
  return input
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Uber's catalogue includes package delivery alongside rides. They are cheap
 * and would wrongly win a "cheapest" comparison, so they are filtered out by
 * name and description.
 */
const PARCEL = /\bparcel\b|send packages|send parcels|courier|delivery/i;

export function isParcelProduct(
  ...text: (string | null | undefined)[]
): boolean {
  return text.some((value) => (value ? PARCEL.test(value) : false));
}

/** Seconds to whole minutes, for Uber's `estimatedTripTime`. */
export function secondsToMinutes(seconds: number | null | undefined): number | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return Math.round(seconds / 60);
}

/**
 * Ola encodes "unknown ETA" as -1. Rendering that naively produces "-1 min",
 * so every negative value collapses to null.
 */
export function positiveOrNull(value: number | null | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return value;
}

/** Formats whole or fractional rupees for display, Indian digit grouping. */
export function formatINR(value: number): string {
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.trunc(abs);
  const paise = Math.round((abs - whole) * 100);

  const digits = whole.toString();
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    grouped = `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ",")},${last3}`;
  }

  const body = paise > 0 ? `${grouped}.${paise.toString().padStart(2, "0")}` : grouped;
  return `${negative ? "-" : ""}₹${body}`;
}
