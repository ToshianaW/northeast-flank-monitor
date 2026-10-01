import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";

const nextConfig: NextConfig = {};

export default function config(phase: string): NextConfig {
  // instrumentation.ts throwing only logs; next start keeps serving 500s. Config load aborts boot.
  if (
    (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_SERVER) &&
    !process.env.ADMIN_PASSWORD
  ) {
    throw new Error(
      "ADMIN_PASSWORD is not set. Set it in .env.local (see .env.example) before starting the server.",
    );
  }
  return nextConfig;
}
