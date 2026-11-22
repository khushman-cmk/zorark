/**
 * Run the GraphHopper routing server on http://localhost:8989.
 *
 *   npm run gh:start
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { findJava, GH_DIR, GH_JAR, run } from "./tools";

async function main() {
  if (!existsSync(path.join(GH_DIR, "graph-cache", "zippi-version.json"))) {
    throw new Error("No routing graph yet — run `npm run gh:import` first");
  }
  await run(findJava(), ["-Xmx3g", "-jar", GH_JAR, "server", "config.yml"], { cwd: GH_DIR });
}

main().catch((err) => {
  console.error(`[gh:start] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
