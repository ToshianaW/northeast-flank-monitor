import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { adminConfigError } from "./src/lib/admin-auth";

// No nonces: they would force every page to render dynamically, so inline scripts need 'unsafe-inline'.
// The map has no tile server: region outlines (/geo) and MapLibre's worker (/maplibre, copied
// from node_modules at dev/build) are same-origin, so no external host and no blob: workers.
function contentSecurityPolicy(isDev: boolean): string {
  return [
    "default-src 'self'",
    // React needs eval in development only, for error stack reconstruction.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
    // MapLibre: setWorkerUrl("/maplibre/maplibre-gl-worker.mjs"), a same-origin module worker.
    "worker-src 'self'",
    // 'unsafe-inline' is also needed by MapLibre, which positions its controls with inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    // Only on Vercel: local `next start` serves plain http://127.0.0.1, which this would break.
    ...(process.env.VERCEL === "1" ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}

export default function config(phase: string): NextConfig {
  // instrumentation.ts throwing only logs; next start keeps serving 500s. Config load aborts boot.
  // Vercel doesn't run this phase, so the admin code also fails closed at request time.
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_SERVER) {
    const error = adminConfigError();
    if (error) throw new Error(error);
  }
  const isDev = phase === PHASE_DEVELOPMENT_SERVER;
  return {
    // Read with fs at request time (src/lib/map-data.ts), so trace it into the server bundle.
    outputFileTracingIncludes: {
      "/": ["./public/geo/theater.geojson"],
      "/map": ["./public/geo/theater.geojson"],
    },
    async headers() {
      return [
        {
          source: "/:path*",
          headers: [
            { key: "Content-Security-Policy", value: contentSecurityPolicy(isDev) },
            { key: "X-Content-Type-Options", value: "nosniff" },
            { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
            { key: "X-Frame-Options", value: "DENY" },
          ],
        },
        {
          // Also covers the login page and redirects, which the metadata tag can't.
          source: "/admin/:path*",
          headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
        },
      ];
    },
  };
}
