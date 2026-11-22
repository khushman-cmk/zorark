/**
 * Run the Python safety pipeline through uv, wherever uv was installed.
 *
 *   npm run safety:setup          # create the Python environment
 *   npm run safety:build          # fetch → extract → analyze → tag → export → calibrate
 *   npm run safety:build -- analyze calibrate   # individual steps
 *   npm run safety:test           # pytest
 */
import { findUv, run, SAFETY_DIR } from "../gh/tools";

async function main() {
  const [mode, ...steps] = process.argv.slice(2);
  const uv = findUv();
  if (mode === "setup") {
    await run(uv, ["python", "install", "3.13"], { cwd: SAFETY_DIR });
    await run(uv, ["sync"], { cwd: SAFETY_DIR });
  } else if (mode === "build") {
    await run(uv, ["run", "python", "-u", "-m", "zsafety", ...(steps.length ? steps : ["all"])], { cwd: SAFETY_DIR });
  } else if (mode === "test") {
    await run(uv, ["run", "pytest", "-q"], { cwd: SAFETY_DIR });
  } else {
    throw new Error("usage: tsx scripts/safety/run.ts setup | build [steps…] | test");
  }
}

main().catch((err) => {
  console.error(`[safety] ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
