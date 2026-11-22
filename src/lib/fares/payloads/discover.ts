/**
 * Schema-less fare discovery.
 *
 * The reason a broken parser can be fixed in minutes: walk any payload,
 * whatever its shape, and surface every plausible fare-bearing leaf with the
 * JSON path that reaches it. Ranking by how often a shape repeats puts the
 * per-ride price field at the top almost every time, because there is one of
 * them per ride.
 */

export type FareCandidate = {
  path: string;
  value: number | string;
  kind: "number" | "currency-string";
};

export type PathSummary = {
  /** Array indices collapsed: data.services[3].fare -> data.services[].fare */
  shape: string;
  count: number;
  sample: number | string;
};

/** Fares live in a plausible range; ids and timestamps do not. */
const MIN_FARE = 10;
const MAX_FARE = 100_000;

const CURRENCY = /₹\s?[\d,]+|(?:INR|Rs\.?)\s?[\d,]+/;

const MAX_NODES = 20_000;

export function discoverFareCandidates(payload: unknown): FareCandidate[] {
  const found: FareCandidate[] = [];
  let visited = 0;

  const walk = (node: unknown, path: string) => {
    if (visited++ > MAX_NODES) return;

    if (typeof node === "number") {
      if (Number.isFinite(node) && node >= MIN_FARE && node <= MAX_FARE) {
        found.push({ path, value: node, kind: "number" });
      }
      return;
    }

    if (typeof node === "string") {
      if (CURRENCY.test(node)) {
        found.push({ path, value: node, kind: "currency-string" });
      }
      return;
    }

    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`));
      return;
    }

    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        walk(child, path ? `${path}.${key}` : key);
      }
    }
  };

  walk(payload, "");
  return found;
}

export function summarisePaths(candidates: FareCandidate[]): PathSummary[] {
  const shapes = new Map<string, { count: number; sample: number | string }>();

  for (const candidate of candidates) {
    const shape = candidate.path.replace(/\[\d+\]/g, "[]");
    const existing = shapes.get(shape);
    if (existing) {
      existing.count += 1;
    } else {
      shapes.set(shape, { count: 1, sample: candidate.value });
    }
  }

  return [...shapes.entries()]
    .map(([shape, { count, sample }]) => ({ shape, count, sample }))
    .sort((a, b) => b.count - a.count || a.shape.localeCompare(b.shape));
}

/**
 * Parses a stored body back into something walkable.
 *
 * Handles the non-JSON cases the console has to cope with: Rapido answers
 * `application/octet-stream` whose body is a JSON array of byte values, and
 * an error page is usually HTML.
 */
export function decodeBody(body: string): { kind: string; value: unknown } {
  const trimmed = body.trim();

  if (/^\[\d+(,\d+)*\]$/.test(trimmed)) {
    try {
      const bytes = JSON.parse(trimmed) as number[];
      return {
        kind: "byte-array",
        value: {
          byteLength: bytes.length,
          // Protobuf, per the spec. Show a readable preview rather than
          // pretending we can fully decode it here.
          preview: Buffer.from(bytes)
            .toString("utf8")
            .replace(/[^\x20-\x7e]+/g, "·")
            .slice(0, 2000),
        },
      };
    } catch {
      /* fall through */
    }
  }

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return { kind: "json", value: JSON.parse(trimmed) };
    } catch {
      /* fall through */
    }
  }

  if (/^<!doctype html|^<html/i.test(trimmed)) {
    return { kind: "html", value: trimmed.slice(0, 4000) };
  }

  return { kind: "text", value: trimmed.slice(0, 4000) };
}
