/**
 * Stores the computed Activity Index (docs/scoring.md) in activity_index_snapshots (migration
 * 0012): one row per scope for the current window. While the index is collecting its baseline,
 * or the baseline is too small, it prints the status and stores nothing. Counts only; no model.
 *
 * Usage: npm run index:snapshot [-- --dry-run]
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { collectingText, FORMULA_VERSION, insufficientText, type ScopeResult } from "@/lib/activity-index";
import { getActivityIndex } from "@/lib/activity-index-data";
import { getPool } from "@/lib/db";

const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL_POOLED) {
  console.error("DATABASE_URL_POOLED is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const { values: args } = parseArgs({ options: { "dry-run": { type: "boolean", default: false } } });
const pool = getPool();

try {
  const result = await getActivityIndex();
  if (result.status === "collecting") console.log(collectingText(result));
  else if (result.status === "insufficient") console.log(insufficientText(result));
  else {
    const scopes: ScopeResult[] = [result.theater, ...result.areas];
    for (const s of scopes) {
      console.log(`${s.scope}: ${s.band} · window ${s.windowEvents} · baseline ${s.baselineEvents} · expected ${s.expected}`);
    }
    if (!args["dry-run"]) {
      let stored = 0;
      for (const s of scopes) {
        const { rowCount } = await pool.query(
          `INSERT INTO activity_index_snapshots (formula_version, scope, baseline_start, baseline_end, window_start,
             window_end, panel_sources, baseline_events, window_events, expected, band, dimensions)
           VALUES ($1, $2, $3::date, $4::date, $5::date, $6::date, $7, $8, $9, $10, $11, $12::jsonb)
           ON CONFLICT (formula_version, scope, window_end) DO NOTHING`,
          [
            FORMULA_VERSION, s.scope, result.windows.baselineStart, result.windows.baselineEnd,
            result.windows.windowStart, result.windows.windowEnd, result.panelSources, s.baselineEvents,
            s.windowEvents, s.expected, s.band, JSON.stringify(s.dimensions),
          ],
        );
        stored += rowCount ?? 0;
      }
      console.log(`stored ${stored} of ${scopes.length} scopes (existing windows are kept)`);
    }
  }
} finally {
  await pool.end();
}
