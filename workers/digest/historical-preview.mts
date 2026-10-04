/**
 * No-model preview of the digest's Historical Context section: built by code from the event types
 * of one UTC day's PUBLISHED events and the published historical counts, then run through the
 * same checks as the generator. No model call and no writes; local use only.
 *
 * Usage: npm run digest:historical-preview -- [--date YYYY-MM-DD]   (default: today, UTC)
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { getPool } from "@/lib/db";
import { isValidDigestDate } from "@/lib/digests";
import { EVENT_TYPE_LABELS } from "@/lib/event-labels";
import { historicalContextLines } from "@/lib/historical-compare";
import { FULL_PERIOD } from "@/lib/historical-rules";
import { getHistoricalCoverage, getTypeMonthCounts } from "@/lib/public-historical";
import { historicalContextSection } from "./check.mjs";
import { loadDigestEvents } from "./input.mjs";

const envFile = fileURLToPath(new URL("../../.env.local", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL_POOLED) {
  console.error("DATABASE_URL_POOLED is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const { values: args } = parseArgs({ options: { date: { type: "string" } } });
const date = args.date?.trim() || new Date().toISOString().slice(0, 10);
if (!isValidDigestDate(date)) throw new Error("--date must be a real date in YYYY-MM-DD form");

const pool = getPool();
try {
  const events = await loadDigestEvents(pool, date);
  const types = [...new Set(events.map((e) => e.event_type))];
  const [typeCounts, coverage] = await Promise.all([getTypeMonthCounts(), getHistoricalCoverage(FULL_PERIOD)]);

  console.log(`Historical Context preview for ${date} (no model call, nothing written)`);
  console.log(`Published events that day: ${events.length}`);
  for (const type of types) {
    console.log(`  ${EVENT_TYPE_LABELS[type]}: ${events.filter((e) => e.event_type === type).length}`);
  }
  console.log(`Historical record: ${coverage.events} published events from ${coverage.sources} sources`);

  if (events.length === 0) {
    console.log("\nNo published events that day, so no digest would be drafted.");
  } else {
    const section = historicalContextSection(historicalContextLines(types, typeCounts, coverage));
    const how =
      section.fallback === null
        ? "generated"
        : section.fallback === "INVALID_LINE"
          ? `fixed line (generated line ${section.badLine} failed its check)`
          : "fixed line (record below threshold)";
    console.log(`\n## Historical Context [${how}]\n`);
    for (const line of section.lines) console.log(line);
  }
} finally {
  await pool.end();
}
