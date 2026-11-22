/**
 * Build the GraphHopper routing graph with the current safety model.
 *
 *   npm run gh:import
 *
 * 1. Generate graphhopper/models/safety.json from config/safety-model.json
 *    (the same buildSafetyModel() the server's scorer uses).
 * 2. Wipe graph-cache/ — CH/LM preparations bake the model in, so a changed
 *    model needs a fresh import.
 * 3. Import data/osm/ncr.safety.osm.pbf (written by `npm run safety:build`).
 * 4. Stamp graph-cache/zippi-version.json with the model hash, so the server
 *    can tell when the engine is running an outdated model.
 */
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { configHash, getSafetyConfig } from "../../src/lib/safety/config";
import { buildSafetyModel } from "../../src/lib/safety/gh-model";
import { findJava, GH_DIR, GH_JAR, ROOT, run } from "./tools";

async function main() {
  const pbf = path.join(ROOT, "data", "osm", "ncr.safety.osm.pbf");
  if (!existsSync(pbf)) throw new Error("data/osm/ncr.safety.osm.pbf is missing — run `npm run safety:build` first");
  if (!existsSync(GH_JAR)) throw new Error("GraphHopper jar is missing — run `npm run gh:jar` first");

  const model = buildSafetyModel(getSafetyConfig());
  mkdirSync(path.join(GH_DIR, "models"), { recursive: true });
  writeFileSync(path.join(GH_DIR, "models", "safety.json"), JSON.stringify(model, null, 2) + "\n");
  console.log(`[gh:import] wrote models/safety.json (${model.priority?.length ?? 0} priority rules)`);

  const cache = path.join(GH_DIR, "graph-cache");
  rmSync(cache, { recursive: true, force: true });

  const started = Date.now();
  await run(findJava(), ["-Xmx4g", "-jar", GH_JAR, "import", "config.yml"], { cwd: GH_DIR });

  writeFileSync(
    path.join(cache, "zippi-version.json"),
    JSON.stringify({ configHash: configHash(), importedAt: new Date().toISOString() }, null, 2) + "\n",
  );
  console.log(`[gh:import] done in ${((Date.now() - started) / 1000).toFixed(0)}s — start it with \`npm run gh:start\``);
}

main().catch((err) => {
  console.error(`[gh:import] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
