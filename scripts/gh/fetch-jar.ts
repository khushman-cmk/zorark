/**
 * Download the GraphHopper server jar from Maven Central and verify its SHA-1.
 *
 *   npm run gh:jar
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { GH_JAR, GH_VERSION } from "./tools";

const BASE = `https://repo1.maven.org/maven2/com/graphhopper/graphhopper-web/${GH_VERSION}/graphhopper-web-${GH_VERSION}.jar`;

const sha1 = (buf: Buffer) => createHash("sha1").update(buf).digest("hex");

async function main() {
  const expected = (await (await fetch(`${BASE}.sha1`)).text()).trim().split(/\s+/)[0];
  if (existsSync(GH_JAR) && sha1(readFileSync(GH_JAR)) === expected) {
    console.log(`[gh:jar] graphhopper-web-${GH_VERSION}.jar is present and verified`);
    return;
  }
  console.log(`[gh:jar] downloading GraphHopper ${GH_VERSION} …`);
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`download failed: HTTP ${res.status}`);
  const jar = Buffer.from(await res.arrayBuffer());
  const actual = sha1(jar);
  if (actual !== expected) throw new Error(`checksum mismatch: expected ${expected}, got ${actual}`);
  writeFileSync(GH_JAR, jar);
  console.log(`[gh:jar] saved ${(jar.length / 1e6).toFixed(1)} MB, SHA-1 verified`);
}

main().catch((err) => {
  console.error(`[gh:jar] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
