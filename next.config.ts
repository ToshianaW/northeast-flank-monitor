import type { NextConfig } from "next";
import {
  PHASE_DEVELOPMENT_SERVER,
  PHASE_PRODUCTION_SERVER,
} from "next/constants";
import { adminConfigError } from "./src/lib/admin-auth";

const nextConfig: NextConfig = {};

export default function config(phase: string): NextConfig {
  // instrumentation.ts throwing only logs; next start keeps serving 500s. Config load aborts boot.
  // Vercel doesn't run this phase, so the admin code also fails closed at request time.
  if (phase === PHASE_DEVELOPMENT_SERVER || phase === PHASE_PRODUCTION_SERVER) {
    const error = adminConfigError();
    if (error) throw new Error(error);
  }
  return nextConfig;
}
