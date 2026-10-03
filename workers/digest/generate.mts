/**
 * Claude-drafted daily digest (roadmap step 2.7).
 * Reads the PUBLISHED events for one UTC day, asks Claude for the spec §16 sections, checks the
 * result in code, and stores it as a DRAFT digest for human review. Nothing is published.
 *
 * Usage: npm run digest -- [--date YYYY-MM-DD] [--dry-run] [--replace-draft] [--force]
 *                          [--max-usd X] [--model ID] [--ci]
 * --date defaults to yesterday (UTC).
 * --dry-run calls the model and prints the digest with the cited events; writes nothing.
 * --replace-draft replaces an existing unedited AI DRAFT. --force also replaces an edited or
 *   manual DRAFT (local use only). A PUBLISHED digest is never replaced.
 * --ci writes GitHub Actions step outputs and prints counts and codes only, never digest text.
 */
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { getPool } from "@/lib/db";
import { formatDigestLine } from "@/lib/digest-refs";
import { DEFAULT_DIGEST_TITLE, DIGEST_SECTIONS, isValidDigestDate, type DigestMeta } from "@/lib/digests";
import type { SourceRelationship } from "@/lib/event-labels";
import { setOutput } from "../lib/ci.mjs";
import { checkDigestOutput, decideDigestWrite, failureLines, quotedPassages, type AliasedEvent } from "./check.mjs";
import { draftDigest, type ModelCall } from "./draft.mjs";
import { loadDigestEvents } from "./input.mjs";
import {
  buildUserMessage,
  OUTPUT_SCHEMA,
  PROMPT_VERSION,
  SYSTEM_PROMPT,
  type DigestEventInput,
} from "./prompt.mjs";

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
    date: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "replace-draft": { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    "max-usd": { type: "string", default: "0.25" },
    model: { type: "string", default: "claude-sonnet-5-5" },
    ci: { type: "boolean", default: false },
  },
});
const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
const date = args.date?.trim() || yesterday;
const dryRun = args["dry-run"]!;
const ci = args.ci!;
const maxUsd = Number(args["max-usd"]);
const model = args.model!;
if (!isValidDigestDate(date)) throw new Error("--date must be a real date in YYYY-MM-DD form");
if (!(maxUsd > 0)) throw new Error("--max-usd must be positive");
if (args.force && !args["replace-draft"]) throw new Error("--force only applies with --replace-draft");

/** USD per million tokens: input, output. */
const PRICES: Record<string, { input: number; output: number }> = {
  "claude-haiku-4-5-20251001": { input: 1, output: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10 },
  "claude-opus-5-5": { input: 4, output: 20 },
};
const price = PRICES[model];
if (!price) throw new Error(`no price entry for model "${model}"`);
const MAX_TOKENS = 8_000;

type Status =
  | "CREATED" | "REPLACED" | "DRY_RUN" | "NO_EVENTS" | "EXISTS" | "PUBLISHED_EXISTS" | "EDITED_DRAFT"
  | "MANUAL_DRAFT" | "SPEND_CAP" | "CHECK_FAILED" | "MODEL_ERROR";

let costUsd = 0;
let eventCount = 0;
let sentenceCount = 0;
let sectionCount = 0;
let attempts = 0;
/** The check code that triggered the retry, if there was one. */
let retriedFor = "";

/** Ends the run. Thrown rather than process.exit(), which trips a libuv assertion on Windows. */
class Finished {
  constructor(
    readonly status: Status,
    readonly detail: string,
  ) {}
}

function finish(status: Status, detail = ""): never {
  throw new Finished(status, detail);
}

const pool = getPool();

async function run(): Promise<never> {
  // 1. Existing digest: decide before spending anything on the model.
  const { rows: [existingRow] } = await pool.query<{
    review_status: string;
    edited: boolean;
    ai_drafted: boolean;
  }>(
    `SELECT review_status, updated_at > created_at AS edited, sections ? '_meta' AS ai_drafted
     FROM daily_digests WHERE digest_date = $1::date`,
    [date],
  );
  const decision = decideDigestWrite(
    existingRow
      ? { review_status: existingRow.review_status, edited: existingRow.edited, aiDrafted: existingRow.ai_drafted }
      : null,
    { replaceDraft: args["replace-draft"]!, force: args.force! },
  );
  if (decision.action === "SKIP" && !dryRun) finish(decision.status);

  // 2. Input: PUBLISHED events for the day, with only the approved fields.
  const eventRows = await loadDigestEvents(pool, date);
  eventCount = eventRows.length;
  if (eventCount === 0) finish("NO_EVENTS");

  const { rows: sourceRows } = await pool.query<{
    event_id: string;
    name: string;
    tier: number | null;
    relationship: SourceRelationship;
  }>(
    `SELECT es.event_id, s.name, s.tier, es.relationship
     FROM event_sources es JOIN sources s ON s.id = es.source_id
     WHERE es.event_id = ANY($1::uuid[])
     ORDER BY es.is_primary DESC, s.tier ASC NULLS LAST, s.name`,
    [eventRows.map((e) => e.event_id)],
  );

  const inputs: DigestEventInput[] = eventRows.map((e, i) => ({
    alias: `E${i + 1}`,
    headline: e.headline,
    summary: e.summary,
    event_date: e.event_date,
    event_type: e.event_type,
    actor: e.actor,
    country: e.country,
    location_name: e.location_name,
    confidence_level: e.confidence_level,
    contradiction_flag: e.contradiction_flag,
    sources: sourceRows
      .filter((s) => s.event_id === e.event_id)
      .map(({ name, tier, relationship }) => ({ name, tier, relationship })),
  }));
  const aliased: AliasedEvent[] = eventRows.map((e, i) => ({
    alias: `E${i + 1}`,
    eventId: e.event_id,
    restricted: e.confidence_level === "UNVERIFIED" || e.contradiction_flag,
    quotes: quotedPassages(e.summary),
  }));

  // 3–5. Model call and code checks, with one retry on a failed check. The spend cap is checked
  // against the worst case before each call and covers both.
  const anthropic = new Anthropic();
  const call: ModelCall = async (messages) => {
    const response = await anthropic.messages.create({
      model,
      max_tokens: MAX_TOKENS,
      thinking: { type: "adaptive" },
      output_config: { effort: "medium", format: { type: "json_schema", schema: OUTPUT_SCHEMA } },
      system: SYSTEM_PROMPT,
      messages,
    });
    const textBlock = response.content.find((b) => b.type === "text");
    return {
      text: textBlock?.type === "text" ? textBlock.text : null,
      stopReason: response.stop_reason,
      costUsd: (response.usage.input_tokens * price.input + response.usage.output_tokens * price.output) / 1_000_000,
    };
  };
  const draft = await draftDigest({
    userMessage: buildUserMessage(date, inputs),
    call,
    check: (output) => checkDigestOutput(output, aliased),
    maxUsd,
    worstCaseUsd: (messages) => {
      const chars = SYSTEM_PROMPT.length + messages.reduce((n, m) => n + m.content.length, 0);
      return ((chars / 3) * price.input + MAX_TOKENS * price.output) / 1_000_000;
    },
  });
  costUsd = draft.costUsd;
  attempts = draft.attempts;
  draft.failures.forEach((failure, i) => {
    for (const line of failureLines(failure, { ci, attempt: i + 1 })) console.log(line);
  });
  if (!draft.ok) finish(draft.status, draft.detail);
  const checked = draft.checked;
  retriedFor = draft.failures[0]?.code ?? "";
  sectionCount = checked.sections.length;
  sentenceCount = checked.sentenceCount;

  // 6. Dry run: print each sentence with the headline and summary of every event it cites (local only).
  if (dryRun) {
    if (!ci) {
      const byAlias = new Map(inputs.map((e) => [e.alias, e]));
      const labels = new Map(DIGEST_SECTIONS.map((s) => [s.key, s.label]));
      console.log(`\n=== DRY RUN: ${DEFAULT_DIGEST_TITLE}, ${date} (not written) ===`);
      for (const section of checked.sections) {
        console.log(`\n## ${labels.get(section.key)}`);
        for (const [i, sentence] of section.sentences.entries()) {
          console.log(`\n${i + 1}. ${sentence.text}`);
          if (sentence.byCode) console.log("   (fixed text written by code, not the model)");
          for (const alias of sentence.aliases) {
            const e = byAlias.get(alias)!;
            console.log(`   ↳ ${alias} [${e.confidence_level}${e.contradiction_flag ? ", contradicted" : ""}] ${e.headline}`);
            console.log(`     ${e.summary ?? "(no summary)"}`);
          }
        }
      }
      const uncited = inputs.length - checked.citedEvents;
      console.log(`\n${checked.citedEvents} of ${inputs.length} events cited${uncited ? `; ${uncited} not cited` : ""}.`);
      if (decision.action === "SKIP") console.log(`A real run would skip: ${decision.status}.`);
    }
    finish("DRY_RUN", decision.action === "SKIP" ? `would skip ${decision.status}` : `would ${decision.action.toLowerCase()}`);
  }

  // 7. Store as DRAFT. DELETE + INSERT for a replacement, so the new draft reads as unedited.
  const meta: DigestMeta = { generator: "ai", model, prompt_version: PROMPT_VERSION, generated_at: new Date().toISOString() };
  const sections: Record<string, unknown> = { _meta: meta };
  for (const s of checked.sections) {
    // The code-written Historical Context line cites no event, so it carries no marker.
    sections[s.key] = s.sentences
      .map((n) => (n.eventIds.length ? formatDigestLine(n.text, n.eventIds) : n.text))
      .join("\n");
  }
  const client = await pool.connect();
  let outcome: { status: Status; detail: string };
  try {
    await client.query("BEGIN");
    if (decision.action === "REPLACE") {
      const { rowCount } = await client.query(
        `DELETE FROM daily_digests WHERE digest_date = $1::date AND review_status = 'DRAFT'
           AND ($2 OR (updated_at = created_at AND sections ? '_meta'))`,
        [date, args.force!],
      );
      if (rowCount !== 1) {
        await client.query("ROLLBACK");
        finish("EDITED_DRAFT", "changed during the run");
      }
    }
    const { rowCount } = await client.query(
      `INSERT INTO daily_digests (digest_date, title, sections, review_status)
       VALUES ($1::date, $2, $3::jsonb, 'DRAFT')
       ON CONFLICT (digest_date) DO NOTHING`,
      [date, DEFAULT_DIGEST_TITLE, JSON.stringify(sections)],
    );
    await client.query("COMMIT");
    outcome =
      rowCount === 1
        ? { status: decision.action === "REPLACE" ? "REPLACED" : "CREATED", detail: "" }
        : { status: "EXISTS", detail: "created during the run" };
  } catch (error) {
    if (!(error instanceof Finished)) await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  finish(outcome.status, outcome.detail);
}

// run() always ends by throwing Finished; anything else is a crash.
const result: Finished = await run().catch(async (error: unknown) => {
  if (error instanceof Finished) return error;
  await pool.end();
  throw error;
});

// A scheduled run that finds a digest already there is fine; a refused replacement is not.
const failed =
  ["EDITED_DRAFT", "MANUAL_DRAFT", "SPEND_CAP", "CHECK_FAILED", "MODEL_ERROR"].includes(result.status) ||
  (result.status === "PUBLISHED_EXISTS" && args["replace-draft"]!);

// Counts and codes only: the repository and its Actions logs are public.
console.log(
  `digest ${date} · ${result.status}${result.detail ? ` (${result.detail})` : ""} · events ${eventCount} · sections ${sectionCount} · sentences ${sentenceCount} · attempts ${attempts}${retriedFor ? ` (retried for ${retriedFor})` : ""} · cost $${costUsd.toFixed(4)} (cap $${maxUsd.toFixed(2)}) · ${model} · ${PROMPT_VERSION}`,
);
if (ci) {
  setOutput("completed", "true");
  setOutput("date", date);
  setOutput("status", result.status);
  setOutput("detail", result.detail.replace(/[^A-Za-z0-9 _-]/g, ""));
  setOutput("events", eventCount);
  setOutput("sections", sectionCount);
  setOutput("sentences", sentenceCount);
  setOutput("attempts", attempts);
  setOutput("retried_for", retriedFor);
  setOutput("cost_usd", costUsd.toFixed(4));
}
await pool.end();
process.exitCode = failed ? 1 : 0;
