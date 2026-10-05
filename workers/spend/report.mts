/**
 * Prints the API spend line for the job summary: recorded model costs over the last 24 hours and the
 * last 30 days, from extraction_runs, dedup_runs and AI digests' sections._meta.cost_usd. Read-only;
 * no model calls. A failed query prints "API spend: unavailable" and exits 0, so it never fails a job.
 * Digest runs that end without a saved draft (failed check, model error) have no recorded cost.
 *
 * Usage: npm run spend:report -- [--ci]
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { getPool } from "@/lib/db";
import { setOutput } from "../lib/ci.mjs";
import { formatSpendLine, SPEND_UNAVAILABLE, type SpendTotals } from "./spend.mjs";

const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
const { values: args } = parseArgs({ options: { ci: { type: "boolean", default: false } } });

async function loadTotals(): Promise<SpendTotals> {
  const { rows: [row] } = await getPool().query<{ d1: string; d30: string; uncosted: number }>(
    `WITH costs AS (
       SELECT started_at AS at, cost_usd FROM extraction_runs
       UNION ALL SELECT started_at, cost_usd FROM dedup_runs
       UNION ALL SELECT (sections->'_meta'->>'generated_at')::timestamptz, (sections->'_meta'->>'cost_usd')::numeric
         FROM daily_digests WHERE sections->'_meta' ? 'cost_usd'
     )
     SELECT coalesce(sum(cost_usd) FILTER (WHERE at > now() - interval '24 hours'), 0)::text AS d1,
            coalesce(sum(cost_usd) FILTER (WHERE at > now() - interval '30 days'), 0)::text AS d30,
            (SELECT count(*)::int FROM daily_digests
              WHERE sections ? '_meta' AND NOT sections->'_meta' ? 'cost_usd'
                AND (sections->'_meta'->>'generated_at')::timestamptz > now() - interval '30 days') AS uncosted
     FROM costs`,
  );
  return { last24h: Number(row.d1), last30d: Number(row.d30), digestsWithoutCost: row.uncosted };
}

let line = SPEND_UNAVAILABLE;
try {
  line = formatSpendLine(await loadTotals());
} catch (error) {
  // Class name only: driver messages can include connection details.
  console.error(`spend report failed: ${error instanceof Error ? error.constructor.name : "error"}`);
}
console.log(line);
if (args.ci) setOutput("line", line);
try {
  await getPool().end();
} catch {
  // Pool never opened (e.g. no connection string); nothing to close.
}
