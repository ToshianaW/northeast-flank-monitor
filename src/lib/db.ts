import "server-only";
import { Pool, types } from "pg";

// DATE columns (OID 1082) come back as UTC midnight rather than local midnight, so
// date.toISOString().slice(0, 10) gives the stored day in any server time zone.
types.setTypeParser(1082, (value: string) => new Date(`${value}T00:00:00Z`));

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
