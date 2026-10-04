/**
 * Claude extraction (roadmap step 2.2).
 * Sends eligible raw_documents rows to Claude and writes validated candidate events as
 * DRAFT events for human review. No deduplication, contradiction detection, or publishing.
 *
 * Usage: npm run extract -- [--dry-run] [--limit N] [--max-usd X] [--model ID] [--ci]
 * --dry-run calls the API on a fixed sample and writes only the extraction_runs row and a
 * local review file (workers/extractor/review/, gitignored: it contains private source text).
 * --ci writes GitHub Actions step outputs (counts only) and never writes the review file.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import type { PoolClient } from "pg";
import { getPool } from "@/lib/db";
import { insertEvent, type EventWritePayload } from "@/lib/events";
import type { Reliability, SourceType } from "@/lib/source-labels";
import { setOutput } from "../lib/ci.mjs";
import { failureReason, type RowErrorKind } from "./failure.mjs";
import {
  buildUserMessage,
  OUTPUT_SCHEMA,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  type ExtractionOutput,
} from "./prompt.mjs";
import { validateEvent, type ValidatedEvent } from "./validate.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const envFile = `${repoRoot}.env.local`;
if (existsSync(envFile)) process.loadEnvFile(envFile);
for (const name of ["DATABASE_URL_POOLED", "ANTHROPIC_API_KEY"]) {
  if (!process.env[name]) {
    console.error(`${name} is not set. Add it to .env.local (see .env.example).`);
    process.exit(1);
  }
}

const { values: args } = parseArgs({
  options: {
    "dry-run": { type: "boolean", default: false },
    limit: { type: "string", default: "100" },
    "max-usd": { type: "string", default: "0.25" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    ci: { type: "boolean", default: false },
  },
});
const dryRun = args["dry-run"]!;
const ci = args.ci!;
const rowLimit = Number(args.limit);
const maxUsd = Number(args["max-usd"]);
const model = args.model!;
if (!Number.isInteger(rowLimit) || rowLimit < 1) throw new Error("--limit must be a positive integer");
if (!(maxUsd > 0)) throw new Error("--max-usd must be positive");

/** USD per million tokens: input, output, cache read, cache write (5-minute TTL). */
const PRICES: Record<string, { input: number; output: number; cacheRead: number; cacheWrite: number }> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5, cacheRead: 0.1, cacheWrite: 1.25 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
};
const price = PRICES[model];
if (!price) throw new Error(`no price entry for model "${model}"`);

/** Rows longer than this are left NEW and reported, never truncated. */
const MAX_TEXT_CHARS = 40_000;
/** Dry-run sample: rows per registry source (decided 2026-10-02). */
const DRY_RUN_SAMPLE: Record<string, number> = {
  ICDS: 1,
  OSINT613: 1,
  ERR: 4,
  Euronews: 4,
  Defence24: 5,
  "mezha.net": 5,
};

type Row = {
  id: string;
  url: string;
  title: string | null;
  raw_text: string | null;
  published_at: Date | null;
  fetched_at: Date;
  language: string | null;
  metadata: Record<string, unknown>;
  source_id: string | null;
  source_name: string | null;
  source_type: SourceType | null;
  source_country: string | null;
  source_language: string | null;
  reliability: Reliability | null;
  tier: number | null;
};

type RowResult = {
  row: Row;
  output: ExtractionOutput | null;
  kept: ValidatedEvent[];
  dropped: Array<{ headline: string; excerpt: string; reason: string }>;
  costUsd: number;
  error?: string;
  /** Set with `error`: a short label for the job summary. */
  errorKind?: RowErrorKind;
};

const pool = getPool();
const anthropic = new Anthropic();

// Eligible: NEW, has text, not no_ai_processing, and not already cited by an event.
const { rows: eligible } = await pool.query<Row>(
  `SELECT r.id, r.url, r.title, r.raw_text, r.published_at, r.fetched_at, r.language, r.metadata,
          r.source_id, s.name AS source_name, s.source_type, s.source_country, s.source_language,
          s.reliability, s.tier
   FROM raw_documents r
   LEFT JOIN sources s ON s.id = r.source_id
   WHERE r.status = 'NEW'
     AND r.text_kind <> 'METADATA_ONLY'
     AND (r.metadata->>'no_ai_processing') IS DISTINCT FROM 'true'
     AND NOT EXISTS (SELECT 1 FROM event_sources es WHERE es.article_url = r.url)
   ORDER BY r.published_at ASC NULLS LAST, r.id`,
);

let selected: Row[];
if (dryRun) {
  selected = [];
  for (const [name, count] of Object.entries(DRY_RUN_SAMPLE)) {
    const fromSource = eligible.filter((r) => r.source_name === name).reverse(); // newest first
    // Include the source's longest row so long-text handling is exercised.
    const longest = [...fromSource].sort((a, b) => (b.raw_text?.length ?? 0) - (a.raw_text?.length ?? 0))[0];
    const picks = longest ? [longest, ...fromSource.filter((r) => r !== longest)] : [];
    selected.push(...picks.slice(0, count));
  }
  selected = selected.slice(0, rowLimit);
} else {
  selected = eligible.slice(0, rowLimit);
}

const { rows: runRows } = await pool.query<{ id: string }>(
  `INSERT INTO extraction_runs (model, prompt_version, dry_run, row_limit, spend_cap_usd)
   VALUES ($1, $2, $3, $4, $5) RETURNING id`,
  [model, PROMPT_VERSION, dryRun, rowLimit, maxUsd],
);
const runId = runRows[0].id;

const totals = {
  rowsSeen: 0,
  rowsProcessed: 0,
  rowsFailed: 0,
  eventsProposed: 0,
  eventsCreated: 0,
  eventsRejected: 0,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  costUsd: 0,
};
const errors: Array<{ raw_document_id: string; error: string; kind: RowErrorKind }> = [];
const results: RowResult[] = [];
let stopReason: "COMPLETED" | "ROW_LIMIT" | "SPEND_CAP" | "ERROR" =
  !dryRun && eligible.length > rowLimit ? "ROW_LIMIT" : "COMPLETED";

/** Conservative pre-call estimate so a run does not start a row it cannot afford. */
function estimateRowCost(row: Row): number {
  const inputTokens = ((row.title?.length ?? 0) + (row.raw_text?.length ?? 0)) / 3 + 2_500;
  return (inputTokens * price.input + 4_000 * price.output) / 1_000_000;
}

async function extractRow(row: Row): Promise<RowResult> {
  const result: RowResult = { row, output: null, kept: [], dropped: [], costUsd: 0 };
  const text = row.raw_text ?? "";
  if (text.length > MAX_TEXT_CHARS) {
    result.error = `text is ${text.length} chars (limit ${MAX_TEXT_CHARS}); left NEW`;
    result.errorKind = "text_too_long";
    return result;
  }
  const publishedAt = row.published_at ?? row.fetched_at;

  const response = await anthropic.messages.create({
    model,
    max_tokens: 16_000,
    thinking: { type: "adaptive" },
    output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
    system: [{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }],
    messages: [
      {
        role: "user",
        content: buildUserMessage({
          publisher: row.source_name!,
          publisherType: row.source_type ?? "UNKNOWN",
          publishedAt,
          language: row.language,
          title: row.title,
          text,
        }),
      },
    ],
  });

  const u = response.usage;
  const input = u.input_tokens;
  const cacheRead = u.cache_read_input_tokens ?? 0;
  const cacheWrite = u.cache_creation_input_tokens ?? 0;
  totals.inputTokens += input;
  totals.outputTokens += u.output_tokens;
  totals.cacheReadTokens += cacheRead;
  totals.cacheWriteTokens += cacheWrite;
  result.costUsd =
    (input * price.input +
      u.output_tokens * price.output +
      cacheRead * price.cacheRead +
      cacheWrite * price.cacheWrite) /
    1_000_000;

  if (response.stop_reason !== "end_turn") {
    result.error = `stop_reason ${response.stop_reason}`;
    result.errorKind = "model_stop";
    return result;
  }
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    result.error = "no text block in response";
    result.errorKind = "no_text_block";
    return result;
  }
  try {
    result.output = JSON.parse(textBlock.text) as ExtractionOutput;
  } catch {
    result.error = "response was not valid JSON";
    result.errorKind = "invalid_json";
    return result;
  }

  for (const event of result.output.events) {
    const outcome = validateEvent(event, { title: row.title, text, publishedAt });
    if (outcome.ok) result.kept.push(outcome.value);
    else result.dropped.push({ headline: event.headline, excerpt: event.supporting_excerpt, reason: outcome.reason });
  }
  return result;
}

function internalNotes(row: Row, output: ExtractionOutput, v: ValidatedEvent): string {
  const e = v.event;
  return [
    `AI-extracted: run ${runId}, ${model}, ${PROMPT_VERSION}. Document kind: ${output.document_kind}.`,
    `Date certainty: ${e.date_certainty}${e.date_note ? ` (${e.date_note})` : ""}.`,
    e.claim_by ? `Claim by: ${e.claim_by}.` : "",
    e.location_generalized ? "Location generalized from a precise position in the source." : "",
    row.metadata.lead_only === true
      ? `Lead-only Tier ${row.tier ?? "?"} source; decision #10: cannot publish on this support alone.`
      : "",
    ...v.flags,
  ]
    .filter(Boolean)
    .join("\n");
}

function eventPayload(row: Row, output: ExtractionOutput, v: ValidatedEvent): EventWritePayload["event"] {
  const e = v.event;
  const publishedAt = row.published_at ?? row.fetched_at;
  return {
    event_date: v.eventDate,
    reported_date: publishedAt,
    headline: e.headline,
    summary: e.summary,
    actor: e.actor,
    country: e.country,
    region: null,
    location_name: e.location_name,
    location_precision: null,
    latitude: null,
    longitude: null,
    event_type: e.event_type,
    event_subtype: null,
    exercise_id: null,
    exercise_name: e.exercise_name,
    exercise_status: null,
    unit_name: null,
    unit_type: null,
    unit_home_location: null,
    personnel_estimate: null,
    equipment_type: null,
    equipment_quantity: null,
    activity_description: null,
    source_name: row.source_name,
    source_url: row.url,
    source_type: row.source_type,
    source_country: row.source_country,
    source_language: row.source_language,
    source_reliability: row.reliability,
    confidence_level: "UNVERIFIED",
    first_reported: publishedAt,
    last_updated: null,
    announced_start_date: v.announcedStart,
    announced_end_date: v.announcedEnd,
    observed_start_date: null,
    observed_end_date: null,
    personnel_return_status: null,
    equipment_return_status: null,
    infrastructure_status: null,
    follow_on_activity: null,
    overall_reset_status: null,
    historical_analogue: null,
    historical_notes: null,
    ai_generated_summary: e.summary,
    internal_notes: internalNotes(row, output, v),
    human_reviewed: false,
    contradiction_flag: false,
    contradiction_notes: null,
  };
}

/** One transaction per row: events, their SUPPORTS sources, and the row's PROCESSED status. */
async function writeRow(client: PoolClient, r: RowResult): Promise<void> {
  await client.query("BEGIN");
  try {
    for (const v of r.kept) {
      const eventId = await insertEvent(client, eventPayload(r.row, r.output!, v));
      await client.query(`UPDATE events SET extraction_run_id = $1 WHERE event_id = $2`, [runId, eventId]);
      await client.query(
        `INSERT INTO event_sources (event_id, source_id, article_url, relationship, is_primary, excerpt)
         VALUES ($1, $2, $3, 'SUPPORTS', true, $4)`,
        [eventId, r.row.source_id, r.row.url, v.event.supporting_excerpt],
      );
    }
    await client.query(
      `UPDATE raw_documents SET status = 'PROCESSED', metadata = metadata || jsonb_build_object('extraction', $2::jsonb)
       WHERE id = $1`,
      [
        r.row.id,
        JSON.stringify({
          run_id: runId,
          model,
          prompt_version: PROMPT_VERSION,
          document_kind: r.output!.document_kind,
          events_proposed: r.output!.events.length,
          events_created: r.kept.length,
          dropped: r.dropped.map((d) => d.reason),
        }),
      ],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

const client = await pool.connect();
try {
  for (const row of selected) {
    if (totals.costUsd + estimateRowCost(row) > maxUsd) {
      stopReason = "SPEND_CAP";
      break;
    }
    totals.rowsSeen++;

    if (!row.source_id) {
      // Not in the registry: never sent to the model; kept as a lead.
      if (!dryRun) {
        await client.query(
          `UPDATE raw_documents SET status = 'SKIPPED',
             metadata = metadata || '{"lead_only": true, "skip_reason": "not_in_registry"}'::jsonb
           WHERE id = $1`,
          [row.id],
        );
      }
      continue;
    }

    let r: RowResult;
    try {
      r = await extractRow(row);
    } catch (error) {
      const auth = error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError;
      r = {
        row,
        output: null,
        kept: [],
        dropped: [],
        costUsd: 0,
        error: error instanceof Error ? error.message : String(error),
        errorKind: auth ? "api_auth" : "api_error",
      };
      if (auth) stopReason = "ERROR";
    }
    totals.costUsd += r.costUsd;
    results.push(r);
    if (r.output) {
      totals.eventsProposed += r.output.events.length;
      totals.eventsRejected += r.dropped.length;
    }
    if (r.error) {
      totals.rowsFailed++;
      errors.push({ raw_document_id: row.id, error: r.error, kind: r.errorKind ?? "api_error" });
      if (stopReason === "ERROR") break;
      continue;
    }
    if (!dryRun) {
      try {
        await writeRow(client, r);
        totals.eventsCreated += r.kept.length;
      } catch (error) {
        totals.rowsFailed++;
        errors.push({
          raw_document_id: row.id,
          error: `write failed: ${error instanceof Error ? error.message : error}`,
          kind: "write_failed",
        });
        continue;
      }
    }
    totals.rowsProcessed++;
  }
} finally {
  client.release();
}

await pool.query(
  `UPDATE extraction_runs SET finished_at = now(), rows_seen = $2, rows_processed = $3, rows_failed = $4,
     events_proposed = $5, events_created = $6, events_rejected = $7, input_tokens = $8, output_tokens = $9,
     cache_read_tokens = $10, cache_write_tokens = $11, cost_usd = $12, stop_reason = $13, errors = $14
   WHERE id = $1`,
  [
    runId,
    totals.rowsSeen,
    totals.rowsProcessed,
    totals.rowsFailed,
    totals.eventsProposed,
    totals.eventsCreated,
    totals.eventsRejected,
    totals.inputTokens,
    totals.outputTokens,
    totals.cacheReadTokens,
    totals.cacheWriteTokens,
    totals.costUsd.toFixed(4),
    stopReason,
    JSON.stringify(errors),
  ],
);

let reviewPath: string | null = null;
if (dryRun && !ci) {
  const dir = `${repoRoot}workers/extractor/review`;
  mkdirSync(dir, { recursive: true });
  reviewPath = `${dir}/${runId}.md`;
  writeFileSync(reviewPath, reviewMarkdown());
}
await pool.end();

// Summary: counts only, never row text.
console.log(`\nExtraction run ${runId}${dryRun ? " (DRY RUN: no events written, rows left NEW)" : ""}`);
console.log(`model ${model} · ${PROMPT_VERSION} · stop: ${stopReason}`);
console.log(
  `rows: ${totals.rowsSeen} seen, ${totals.rowsProcessed} ok, ${totals.rowsFailed} failed (of ${selected.length} selected, ${eligible.length} eligible)`,
);
console.log(
  `events: ${totals.eventsProposed} proposed, ${totals.eventsRejected} dropped by validation, ${dryRun ? `${totals.eventsProposed - totals.eventsRejected} would be created` : `${totals.eventsCreated} created`}`,
);
console.log(
  `tokens: ${totals.inputTokens} in, ${totals.cacheReadTokens} cache read, ${totals.cacheWriteTokens} cache write, ${totals.outputTokens} out · cost $${totals.costUsd.toFixed(4)} (cap $${maxUsd.toFixed(2)})`,
);
for (const e of errors) console.log(`error ${e.raw_document_id}: ${e.error}`);
if (reviewPath) console.log(`review file: ${reviewPath}`);
if (ci) {
  setOutput("completed", "true");
  setOutput("stop_reason", stopReason);
  setOutput("drafts_created", totals.eventsCreated);
  setOutput("drafts_would_create", dryRun ? totals.eventsProposed - totals.eventsRejected : 0);
  setOutput("cost_usd", totals.costUsd.toFixed(4));
  // Why the step exits 1 (labels and counts only), for the job summary.
  setOutput("failure_reason", failureReason(errors));
}
if (errors.length > 0) process.exitCode = 1;

function reviewMarkdown(): string {
  const out: string[] = [
    `# Extraction dry run ${runId}`,
    "",
    `Model ${model} · ${PROMPT_VERSION} · ${new Date().toISOString()} · cost $${totals.costUsd.toFixed(4)}`,
    "",
    "Private: contains raw source text. Mark each proposed event `accept` or `reject (reason)`, and note any missed event per row.",
    "",
  ];
  results.forEach((r, i) => {
    const row = r.row;
    out.push(
      "---",
      "",
      `## ${i + 1}. ${row.source_name} (Tier ${row.tier ?? "?"}${row.metadata.lead_only === true ? ", lead-only" : ""}): ${row.title ?? "(no title)"}`,
      "",
      `- URL: ${row.url}`,
      `- Published: ${(row.published_at ?? row.fetched_at).toISOString()} · ${row.raw_text?.length ?? 0} chars · cost $${r.costUsd.toFixed(4)}`,
      `- Document kind: ${r.output?.document_kind ?? "-"}`,
      "",
      "### Source text",
      "",
      "```text",
      (row.raw_text ?? "").replace(/```/g, "'''"),
      "```",
      "",
      "### Model output",
      "",
    );
    if (r.error) out.push(`**Error:** ${r.error}`, "");
    else if (r.output!.events.length === 0) out.push("No events proposed.", "");
    r.kept.forEach((v, j) => {
      const e = v.event;
      out.push(
        `**Event ${j + 1}: ${e.headline}**`,
        "",
        `- ${e.event_type} · ${e.event_date} (${e.date_certainty}${e.date_note ? `: ${e.date_note}` : ""})`,
        `- Actor: ${e.actor ?? "-"} · Country: ${e.country ?? "-"} · Location: ${e.location_name ?? "-"}${e.location_generalized ? " (generalized)" : ""}`,
        `- Claim by: ${e.claim_by ?? "-"}`,
        `- Exercise: ${e.exercise_name ?? "-"} · Announced: ${e.announced_start_date ?? "-"} to ${e.announced_end_date ?? "-"}`,
        `- Summary: ${e.summary}`,
        `- Excerpt: "${e.supporting_excerpt}"`,
        ...v.flags.map((f) => `- Flag: ${f}`),
        "",
        "Verdict: ",
        "",
      );
    });
    for (const d of r.dropped) {
      out.push(`**Dropped by validation:** ${d.headline} (${d.reason}). Excerpt: "${d.excerpt}"`, "");
    }
    out.push("Missed event? ", "");
  });
  return out.join("\n");
}
