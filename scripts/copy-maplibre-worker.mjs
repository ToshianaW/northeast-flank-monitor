/**
 * Copies MapLibre's worker module (and the shared chunk it imports) into public/maplibre/,
 * so the map can start its worker from our own origin: setWorkerUrl("/maplibre/...") and
 * CSP worker-src 'self', with no blob: workers. Chained into the dev and build scripts, so
 * it runs on Vercel too. The output is gitignored and always matches node_modules.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const dist = dirname(createRequire(import.meta.url).resolve("maplibre-gl/package.json"));
const out = join(process.cwd(), "public", "maplibre");
mkdirSync(out, { recursive: true });
for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(dist, "dist", file), join(out, file));
}
console.log("Copied MapLibre worker to public/maplibre/");
