/**
 * Duplicate suggestions (roadmap step 2.3). Never merges anything: it records candidate
 * pairs that the review page shows as "Possible duplicate of ...".
 *
 * Usage: npm run dedup -- [--dry-run] [--no-model] [--max-usd X] [--max-calls N] [--subjects pending|all]
 * --dry-run writes only the dedup_runs row and prints the pairs.
 * --subjects all also treats PUBLISHED events as subjects (for testing).
 * --ci prints counts only (no headlines or model reasons) and writes GitHub Actions step outputs.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import pg from "pg";
import { setOutput } from "../lib/ci.mjs";
import { ESTIMATED_CALL_USD, JUDGE_MODEL, judgePair, type Verdict } from "./judge.mjs";
import { classifyPair, DEDUP_MAX_USD, findPairs, isNoAiOnly, judgeCapReached, type ModelSkip } from "./pairs.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const envFile = `${repoRoot}.env.local`;
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    "no-model": { type: "boolean", default: false },
    "max-usd": { type: "string", default: String(DEDUP_MAX_USD) },
    "max-calls": { type: "string", default: "200" },
    subjects: { type: "string", default: "pending" },
    ci: { type: "boolean", default: false },
  },
});
const dryRun = args["dry-run"]!;
const ci = args.ci!;
const noModel = args["no-model"]!;
const maxUsd = Number(args["max-usd"]);
const maxCalls = Number(args["max-calls"]);
const subjects = args.subjects === "all" ? "all" : "pending";
if (!(maxUsd >= 0)) throw new Error("--max-usd must be zero or positive");
if (!Number.isInteger(maxCalls) || maxCalls < 0) throw new Error("--max-calls must be a non-negative integer");
for (const name of ["DATABASE_URL", ...(noModel ? [] : ["ANTHROPIC_API_KEY"])]) {
  if (!process.env[name]) {
    console.error(`${name} is not set. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
}

// Same no-AI set the collector uses: the config list plus feeds and listings flagged no_ai_processing.
type SourceFlags = { source: string; no_ai_processing: boolean };
const collector = JSON.parse(readFileSync(`${repoRoot}data/sources/collector.json`, "utf8")) as {
  no_ai_processing_sources: string[];
  feeds: SourceFlags[];
  listings: SourceFlags[];
};
const noAiSources = new Set([
  ...collector.no_ai_processing_sources,
  ...collector.feeds.filter((f) => f.no_ai_processing).map((f) => f.source),
  ...collector.listings.filter((l) => l.no_ai_processing).map((l) => l.source),
]);

const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
const anthropic = noModel ? null : new Anthropic();

const { rows: runRows } = await client.query<{ id: string }>(
  `INSERT INTO dedup_runs (model, dry_run, spend_cap_usd) VALUES ($1, $2, $3) RETURNING id`,
  [noModel ? null : JUDGE_MODEL, dryRun, maxUsd],
);
const runId = runRows[0].id;

const pairs = await findPairs(client, { subjects, skipExisting: !dryRun });
const totals = { likely: 0, borderline: 0, calls: 0, inputTokens: 0, outputTokens: 0, costUsd: 0 };
const errors: Array<{ pair: string; error: string }> = [];
let stopReason: "COMPLETED" | "SPEND_CAP" | "ERROR" = "COMPLETED";
const lines: string[] = [];

for (const p of pairs) {
  const capReached = judgeCapReached(totals, { maxCalls, maxUsd, estimatedCallUsd: ESTIMATED_CALL_USD });
  const c = classifyPair({
    similarity: p.similarity,
    sameArticle: p.same_article,
    noAiOnly: isNoAiOnly(p.a_support, noAiSources) || isNoAiOnly(p.b_support, noAiSources),
    modelUnavailable: noModel ? "NO_MODEL" : capReached ? "SPEND_CAP" : null,
  });
  if (c.kind === "IGNORE") continue;

  let basis: "SAME_ARTICLE" | "TRIGRAM" | "MODEL";
  let verdict: Verdict | null = null;
  let skipped: ModelSkip | null = null;
  if (c.kind === "LIKELY") {
    basis = c.basis;
    totals.likely++;
  } else if (c.kind === "BORDERLINE") {
    basis = "TRIGRAM";
    skipped = c.skipped;
    totals.borderline++;
    if (c.skipped === "SPEND_CAP") stopReason = "SPEND_CAP";
  } else {
    totals.borderline++;
    try {
      const judged = await judgePair(anthropic!, client, p.a_id, p.b_id);
      totals.calls++;
      totals.inputTokens += judged.inputTokens;
      totals.outputTokens += judged.outputTokens;
      totals.costUsd += judged.costUsd;
      if (!judged.verdict) throw new Error(judged.error);
      verdict = judged.verdict;
      basis = "MODEL";
    } catch (error) {
      // Keep the pair visible on similarity alone rather than dropping it.
      errors.push({ pair: `${p.a_id}/${p.b_id}`, error: error instanceof Error ? error.message : String(error) });
      if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
        stopReason = "ERROR";
      }
      basis = "TRIGRAM";
      skipped = "NO_MODEL";
    }
  }

  lines.push(
    `${p.similarity.toFixed(2)} ${basis}${verdict ? `:${verdict.verdict}` : ""}${skipped ? ` (no model: ${skipped})` : ""}` +
      `\n   A ${p.a_date} ${p.a_status}: ${p.a_headline}\n   B ${p.b_date} ${p.b_status}: ${p.b_headline}` +
      (verdict ? `\n   reason: ${verdict.reason}` : ""),
  );

  if (!dryRun) {
    await client.query(
      `INSERT INTO duplicate_candidates
         (event_id, candidate_event_id, dedup_run_id, basis, headline_similarity, model_verdict, model_reason, model_skipped)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (event_id, candidate_event_id) DO NOTHING`,
      [p.a_id, p.b_id, runId, basis, p.similarity, verdict?.verdict ?? null, verdict?.reason ?? null, skipped],
    );
  }
  if (stopReason === "ERROR") break;
}

const { rows: considered } = await client.query<{ n: number }>(
  `SELECT count(*)::int AS n FROM events WHERE review_status IN ('DRAFT', 'PENDING_REVIEW')
     OR ($1::boolean AND review_status = 'PUBLISHED')`,
  [subjects === "all"],
);
await client.query(
  `UPDATE dedup_runs SET finished_at = now(), events_considered = $2, pairs_considered = $3, pairs_likely = $4,
     pairs_borderline = $5, model_calls = $6, input_tokens = $7, output_tokens = $8, cost_usd = $9,
     stop_reason = $10, errors = $11
   WHERE id = $1`,
  [
    runId,
    considered[0].n,
    pairs.length,
    totals.likely,
    totals.borderline,
    totals.calls,
    totals.inputTokens,
    totals.outputTokens,
    totals.costUsd.toFixed(4),
    stopReason,
    JSON.stringify(errors),
  ],
);
await client.end();

console.log(`\nDedup run ${runId}${dryRun ? " (DRY RUN: no candidates written)" : ""} · subjects: ${subjects} · stop: ${stopReason}`);
console.log(
  `pairs: ${pairs.length} considered, ${totals.likely} likely, ${totals.borderline} borderline · model calls ${totals.calls} · cost $${totals.costUsd.toFixed(4)} (cap $${maxUsd.toFixed(2)})`,
);
// Pair lines carry headlines of unreviewed events: kept out of public CI logs.
if (!ci) for (const line of lines) console.log(line);
for (const e of errors) console.log(`error ${e.pair}: ${e.error}`);
if (ci) {
  setOutput("completed", "true");
  setOutput("candidates", totals.likely + totals.borderline);
  setOutput("cost_usd", totals.costUsd.toFixed(4));
}
if (errors.length > 0) process.exitCode = 1;
