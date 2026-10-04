/**
 * Backfill automatic "similar in nature" links (same event type AND same country; no model) for
 * every PUBLISHED current event, oldest first. DRY RUN by default: prints each event's headline,
 * the headlines it would be linked to with the shared attributes, the 0/1/2/3 distribution and
 * the most-used historical entries, and writes nothing. --write links for real (autoLinkEvent per
 * event, the same rules as on publish), logged like any link.
 *
 * Usage: npm run references:backfill [-- --write]
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { getPool } from "@/lib/db";
import {
  autoLinkEvent,
  listHistoricalForAutoLink,
  listPublishedForAutoLink,
  loadAutoState,
  referencesTableExists,
} from "@/lib/historical-references";
import { ATTRIBUTE_LABELS, MAX_REFERENCES, planAutoLinks } from "@/lib/historical-references-rules";

const envFile = fileURLToPath(new URL("../.env.local", import.meta.url));
if (existsSync(envFile)) process.loadEnvFile(envFile);
if (!process.env.DATABASE_URL_POOLED) {
  console.error("DATABASE_URL_POOLED is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const { values: args } = parseArgs({ options: { write: { type: "boolean", default: false } } });
const pool = getPool();

try {
  if (!(await referencesTableExists())) throw new Error("migration 0010 is not applied");
  const [events, historical, state] = await Promise.all([
    listPublishedForAutoLink(),
    listHistoricalForAutoLink(),
    loadAutoState(),
  ]);
  const headlineOf = new Map(historical.map((h) => [h.event_id, h.headline]));
  const plan = planAutoLinks(events, historical, state);

  console.log(`${args.write ? "WRITE" : "DRY RUN (nothing written)"}: ${events.length} published events, ${historical.length} published historical entries\n`);
  const distribution = new Map<number, number>();
  const used = new Map<string, number>();
  for (const e of events) {
    const existing = state.existingByEvent.get(e.event_id)?.length ?? 0;
    const links = plan.get(e.event_id) ?? [];
    const total = existing + links.length;
    distribution.set(total, (distribution.get(total) ?? 0) + 1);
    console.log(`${e.headline}`);
    if (existing > 0) console.log(`  (${existing} existing link${existing === 1 ? "" : "s"} kept)`);
    if (links.length === 0 && existing === 0) console.log("  (no automatic link: no published entry of the same type and country)");
    for (const l of links) {
      used.set(l.historical_event_id, (used.get(l.historical_event_id) ?? 0) + 1);
      console.log(`  -> ${headlineOf.get(l.historical_event_id)} [${l.attributes.map((a) => ATTRIBUTE_LABELS[a]).join(", ")}]`);
    }
  }

  console.log(`\nLinks per event: ${Array.from({ length: MAX_REFERENCES + 1 }, (_, n) => `${n}: ${distribution.get(n) ?? 0}`).join(" · ")}`);
  const top = [...used].sort((a, b) => b[1] - a[1] || (headlineOf.get(a[0])! < headlineOf.get(b[0])! ? -1 : 1)).slice(0, 5);
  console.log("Most-used historical entries:");
  for (const [id, n] of top) console.log(`  ${n} × ${headlineOf.get(id)}`);

  if (args.write) {
    let made = 0;
    for (const e of events) made += await autoLinkEvent(e.event_id);
    console.log(`\nLinked ${made} automatically.`);
  }
} finally {
  await pool.end();
}
