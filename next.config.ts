import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { adminConfigError } from "./src/lib/admin-auth";

// No nonces: they would force every page to render dynamically, so inline scripts need 'unsafe-inline'.
// UPDATE THIS POLICY WHEN THE MAP IS ADDED: tile servers (img-src, connect-src) and the map
// library's web workers (worker-src, often blob:) are blocked by the current policy.
function contentSecurityPolicy(isDev: boolean): string {
  return [
    "default-src 'self'",
    // React needs eval in development only, for error stack reconstruction.
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
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
