import { money } from "../money";
import type { FareOption } from "../types";

/**
 * Turns Rapido's rendered fare cards into FareOptions.
 *
 * Pure, so it is testable against captured card text with no browser. Card
 * text arrives whitespace-collapsed, e.g. "Auto ₹ 104 - ₹ 125" or
 * "Bike ₹ 45".
 */

const CARD = /^(.*?)\s*₹\s*([\d,]+)(?:\s*-\s*₹\s*([\d,]+))?/;

export function parseRapidoCard(text: string): FareOption | null {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = cleaned.match(CARD);
  if (!match) return null;

  const name = match[1].trim();
  const low = money(match[2]);
  const high = match[3] ? money(match[3]) : null;
  if (!name || low === null) return null;

  return {
    name,
    category: name.toLowerCase(),
    // Quote the low end. The high end makes Rapido look uncompetitive against
    // two platforms that quote a single number, and a midpoint would invent a
    // figure the platform never stated. The range is preserved in priceNote.
    price: low,
    currency: "INR",
    priceNote:
      high !== null && high !== low ? `Range ₹${match[2]}–₹${match[3]}` : null,
    etaText: null,
    durationMin: null,
    capacity: null,
  };
}

export function normalizeRapido(cards: string[]): FareOption[] {
  const seen = new Set<string>();
  const options: FareOption[] = [];

  for (const card of cards) {
    const option = parseRapidoCard(card);
    if (!option) continue;
    const key = option.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    options.push(option);
  }

  return options;
}
