/**
 * Posts queued items to X by hand: a dry run to preview, or retries of failed posts. Normally the
 * admin site posts right after you approve or save (src/lib/x-posting.ts); this is not scheduled.
 * See src/lib/x-queue.ts for what is posted. Historical events are never queued.
 *
 * Usage: npm run x:post                 dry run: prints what would be posted; reads only, writes nothing
 *        npm run x:post -- --post       posts, only if X_POSTING_ENABLED=true in .env.local
 * Options: --limit N (default 10 per run). A rolling 24-hour cap (X_DAILY_CAP, default 20) applies.
 * Needs X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET to post. Never prints them.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import pg from "pg";
import { processXQueue, xSettingsFromEnv } from "@/lib/x-queue";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
if (existsSync(`${repoRoot}.env.local`)) process.loadEnvFile(`${repoRoot}.env.local`);
if (!process.env.DATABASE_URL_POOLED) {
  console.error("DATABASE_URL_POOLED is not set. Add it to .env.local (see .env.example).");
  process.exit(1);
}

const { values: args } = parseArgs({ options: { post: { type: "boolean", default: false }, limit: { type: "string", default: "10" } } });
const limit = Number(args.limit);
if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error("--limit must be 1-50");

const settings = xSettingsFromEnv(process.env);
if (args.post && process.env.X_POSTING_ENABLED !== "true") {
  console.log("--post given but X_POSTING_ENABLED is not \"true\"; running as a dry run.");
} else if (args.post && settings.missing.length) {
  console.error(`Missing ${settings.missing.join(", ")} in .env.local; nothing posted.`);
  process.exit(1);
}
const live = args.post && settings.enabled;

const db = new pg.Client({ connectionString: process.env.DATABASE_URL_POOLED });
await db.connect();
const r = await processXQueue(db, {
  live,
  creds: settings.creds,
  limit,
  dailyCap: settings.dailyCap,
  siteUrl: settings.siteUrl,
  log: (line) => console.log(`  ${line}`),
});
await db.end();

console.log(`x:post · ${live ? "LIVE" : "DRY RUN (nothing is posted)"} · ${r.queued} queued · ${r.postedToday} posted in the last 24 h (cap ${settings.dailyCap})`);
console.log(
  live
    ? `Posted ${r.posted} · skipped ${r.skipped} · failed ${r.failed}${r.capped ? ` · ${r.capped} held by the daily cap` : ""}`
    : `Would post ${r.wouldPost} · would skip ${r.skipped} (dry run: nothing was written or posted)`,
);
