/**
 * Serve MapLibre's web worker from /public.
 *
 * maplibre-gl 6 resolves its worker with `new URL(variable, import.meta.url)`,
 * which no bundler can follow, so under Next.js the default worker URL 404s
 * and the map stays blank. The worker bundle is self-contained, so we copy it
 * next to the app and point `setWorkerUrl` at it (see MapView.tsx). Runs on
 * postinstall, which keeps it in lockstep with the installed version.
 */
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const src = path.join("node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const dir = path.join("public", "maplibre");

if (!existsSync(src)) {
  console.warn("[maplibre] worker not found; skipping copy");
} else {
  mkdirSync(dir, { recursive: true });
  copyFileSync(src, path.join(dir, "maplibre-gl-worker.mjs"));
  console.log("[maplibre] copied worker to public/maplibre/");
}
