import "server-only";
import { Pool } from "pg";

declare global {
  var __nfmPool: Pool | undefined;
}

function createPool(): Pool {
  const connectionString = process.env.DATABASE_URL_POOLED;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL_POOLED is not set. The web app uses Neon's pooled connection; set it in .env.local (see .env.example).",
    );
  }
  return new Pool({ connectionString, max: 5 });
}

// Reuse one pool across dev hot reloads.
export function getPool(): Pool {
  globalThis.__nfmPool ??= createPool();
  return globalThis.__nfmPool;
}
