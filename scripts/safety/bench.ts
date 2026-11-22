/**
 * Benchmark /api/directions with random trips across NCR's built-up core.
 *
 *   npm run safety:bench                 # 200 trips against http://localhost:3000
 *   BENCH_URL=… BENCH_N=500 npm run safety:bench
 *
 * Reports server time (meta.tookMs) and end-to-end time, plus how often the
 * safest route differs from the fastest. Run against `npm start` for
 * production numbers; `npm run dev` adds compile and dev-mode overhead.
 */

const BASE = process.env.BENCH_URL || "http://localhost:3000";
const N = Number(process.env.BENCH_N || 200);
const CORE = { w: 77.0, s: 28.45, e: 77.5, n: 28.75 };

let seed = 7;
const rand = () => ((seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31);

function trip() {
  for (;;) {
    const from = { lat: CORE.s + rand() * (CORE.n - CORE.s), lng: CORE.w + rand() * (CORE.e - CORE.w) };
    const to = { lat: CORE.s + rand() * (CORE.n - CORE.s), lng: CORE.w + rand() * (CORE.e - CORE.w) };
    const km = Math.hypot((to.lat - from.lat) * 111, (to.lng - from.lng) * 97.7);
    if (km >= 2 && km <= 15) return { from, to };
  }
}

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];

async function main() {
  const server: number[] = [];
  const wall: number[] = [];
  const errors = new Map<string, number>();
  let differ = 0;
  const extraTime: number[] = [];
  const riskCut: number[] = [];
  const scoreGain: number[] = [];
  let rerouted = 0;
  for (let i = 0; i < N; i++) {
    const t = performance.now();
    const res = await fetch(`${BASE}/api/directions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(trip()),
    });
    const json = (await res.json()) as {
      data?: {
        sameRoute: boolean;
        meta: { tookMs: number; potholeReroute: boolean };
        fastest: { timeS: number; safety: { riskyM: number; score: number } };
        safest: { timeS: number; safety: { riskyM: number; score: number } };
      };
      code?: string;
    };
    if (!res.ok || !json.data) {
      errors.set(json.code ?? String(res.status), (errors.get(json.code ?? String(res.status)) ?? 0) + 1);
      continue;
    }
    wall.push(performance.now() - t);
    server.push(json.data.meta.tookMs);
    if (!json.data.sameRoute) {
      differ++;
      const { fastest, safest } = json.data;
      extraTime.push((safest.timeS - fastest.timeS) / Math.max(1, fastest.timeS));
      riskCut.push(fastest.safety.riskyM > 0 ? 1 - safest.safety.riskyM / fastest.safety.riskyM : 0);
      scoreGain.push(safest.safety.score - fastest.safety.score);
    }
    if (json.data.meta.potholeReroute) rerouted++;
  }
  server.sort((a, b) => a - b);
  wall.sort((a, b) => a - b);
  const row = (name: string, v: number[]) =>
    console.log(`${name.padEnd(8)} p50 ${pct(v, 50).toFixed(0)} ms · p95 ${pct(v, 95).toFixed(0)} ms · max ${v.at(-1)!.toFixed(0)} ms`);
  console.log(`${server.length}/${N} trips routed (2–15 km) against ${BASE}`);
  row("server", server);
  row("wall", wall);
  console.log(`safest differs from fastest: ${((differ / server.length) * 100).toFixed(0)}% · pothole re-routes: ${rerouted}`);
  if (differ) {
    for (const v of [extraTime, riskCut, scoreGain]) v.sort((a, b) => a - b);
    console.log(
      `when they differ: extra time p50 +${(pct(extraTime, 50) * 100).toFixed(0)}% (p90 +${(pct(extraTime, 90) * 100).toFixed(0)}%) · ` +
        `risky road cut p50 ${(pct(riskCut, 50) * 100).toFixed(0)}% · safety score gain p50 +${pct(scoreGain, 50)}`,
    );
  }
  if (errors.size) console.log("errors:", Object.fromEntries(errors));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
