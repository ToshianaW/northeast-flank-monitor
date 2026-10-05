/**
 * Full-text retry with a fake HttpClient: one retry per row, temporary reasons only, never
 * robots / paywalled / skip-listed, 24-hour window, the shared page cap, and same-host redirects.
 * No network or database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import type { FullTextScope } from "./article.mjs";
import { RobotsDisallowedError } from "./fetch.mjs";
import { retryFullText, retryIneligibility, type StoredRow } from "./retry.mjs";

const NOW = new Date("2026-10-05T12:00:00Z");
const LIMITS = { minChars: 200, maxChars: 40_000 };
const ARTICLE = `<html><body><article><p>${"The ministry said units began a readiness check near the border. ".repeat(6)}</p></article></body></html>`;
const EMPTY = "<html><body><div>No article here.</div></body></html>";

const scope: FullTextScope = { masterOn: true, optedIn: true, homeDomain: "gov.pl", barredDomains: ["blocked.example"] };
const scopeFor = (key: string) => (key === "gdelt" ? undefined : key === "off" ? { ...scope, optedIn: false } : scope);

let n = 0;
function row(over: Partial<StoredRow> = {}): StoredRow {
  n++;
  return {
    id: `row-${n}`,
    url: `https://www.gov.pl/web/rcb/alert-${n}`,
    collector_key: "pl-rcb",
    title: "Alert",
    fetched_at: new Date(NOW.getTime() - 2 * 3_600_000),
    raw_text: null,
    status: "NEW",
    metadata: { full_text_error: "no_article_body" },
    ...over,
  };
}

/** Fake HttpClient: answers by URL and records every request. */
function fakeHttp(pages: Record<string, string | Error>) {
  const calls: string[] = [];
  return {
    calls,
    http: {
      async get(url: string) {
        calls.push(url);
        const page = pages[url];
        if (page instanceof Error) throw page;
        return page === undefined ? { status: 404, body: "" } : { status: 200, body: page };
      },
    },
  };
}

test("a failed row is retried once and recovered: full text, error cleared, back to NEW", async () => {
  const r = row({ status: "PROCESSED", raw_text: null });
  const { http, calls } = fakeHttp({ [r.url]: ARTICLE });
  const budget = { remaining: 30 };
  const { updates, counts } = await retryFullText(http, [r], scopeFor, LIMITS, budget, NOW);
  assert.deepEqual(counts, { retried: 1, recovered: 1, capped: 0 });
  assert.equal(calls.length, 1);
  assert.equal(budget.remaining, 29, "counts against the shared page cap");
  const u = updates[0];
  assert.ok(u.recovered);
  if (u.recovered) {
    assert.ok(u.rawText.length >= 200);
    assert.equal(u.metadata.full_text_error, undefined, "error cleared");
    assert.equal(u.metadata.full_text_retried, true);
  }
  const collect = readFileSync(join(process.cwd(), "workers/collector/collect.mts"), "utf8");
  assert.match(collect, /SET raw_text = \$2, text_kind = 'FULL_TEXT', content_hash = \$3, metadata = \$4::jsonb, status = 'NEW'/);
});

test("a second failure is not retried again", async () => {
  const r = row();
  const first = fakeHttp({ [r.url]: EMPTY });
  const { updates } = await retryFullText(first.http, [r], scopeFor, LIMITS, { remaining: 30 }, NOW);
  assert.equal(updates[0].recovered, false);
  assert.equal(updates[0].metadata.full_text_retried, true);
  assert.equal(updates[0].metadata.full_text_error, "no_article_body", "a failed retry leaves the row alone");
  const again = fakeHttp({ [r.url]: ARTICLE });
  const second = await retryFullText(again.http, [{ ...r, metadata: updates[0].metadata }], scopeFor, LIMITS, { remaining: 30 }, NOW);
  assert.equal(again.calls.length, 0);
  assert.equal(second.counts.retried, 0);
});

test("robots, paywalled, skip-listed, barred and non-temporary failures are never retried", async () => {
  const never = [
    row({ metadata: { full_text_error: "robots" } }),
    row({ metadata: { full_text_error: "http_status" } }),
    row({ metadata: { full_text_error: "no_article_body", pay_status: "Paid" } }),
    row({ status: "SKIPPED", metadata: { full_text_error: "no_article_body", skip_reason: "no_keyword_match" } }),
    row({ metadata: { full_text_error: "no_article_body", skip_reason: "not_in_registry" } }),
    row({ url: "https://blocked.example/a", metadata: { full_text_error: "timeout" } }),
    row({ metadata: { full_text_error: "too_short", no_ai_processing: true } }),
    row({ metadata: { full_text_error: "timeout", lead_only: true } }),
    row({ collector_key: "off" }),
    row({ collector_key: "gdelt" }),
    row({ url: "https://other.example/a" }),
  ];
  const { http, calls } = fakeHttp({});
  const { counts } = await retryFullText(http, never, scopeFor, LIMITS, { remaining: 30 }, NOW);
  assert.equal(calls.length, 0);
  assert.equal(counts.retried, 0);
  for (const r of never) assert.notEqual(retryIneligibility(r, scopeFor(r.collector_key), NOW), null);
});

test("rows first collected more than 24 hours ago are not retried", async () => {
  const old = row({ fetched_at: new Date(NOW.getTime() - 25 * 3_600_000) });
  const recent = row({ fetched_at: new Date(NOW.getTime() - 23 * 3_600_000), metadata: { full_text_error: "too_short" } });
  const { http, calls } = fakeHttp({ [recent.url]: ARTICLE });
  await retryFullText(http, [old, recent], scopeFor, LIMITS, { remaining: 30 }, NOW);
  assert.deepEqual(calls, [recent.url]);
});

test("the page cap is respected; capped rows stay unmarked for a later run", async () => {
  const rows = [row(), row(), row()];
  const { http, calls } = fakeHttp(Object.fromEntries(rows.map((r) => [r.url, ARTICLE])));
  const budget = { remaining: 1 };
  const { updates, counts } = await retryFullText(http, rows, scopeFor, LIMITS, budget, NOW);
  assert.equal(calls.length, 1);
  assert.deepEqual(counts, { retried: 1, recovered: 1, capped: 2 });
  assert.equal(updates.length, 1, "rows over the cap are not marked as retried");
  assert.equal(budget.remaining, 0);
});

test("timeouts and robots refusals during the retry only mark the row", async () => {
  const timeout = row({ metadata: { full_text_error: "timeout" } });
  const robots = row();
  const timeoutError = Object.assign(new Error("timed out"), { name: "TimeoutError" });
  const { http } = fakeHttp({ [timeout.url]: timeoutError, [robots.url]: new RobotsDisallowedError("disallowed by robots.txt") });
  const { updates, counts } = await retryFullText(http, [timeout, robots], scopeFor, LIMITS, { remaining: 30 }, NOW);
  assert.deepEqual(counts, { retried: 2, recovered: 0, capped: 0 });
  assert.deepEqual(updates.map((u) => u.metadata.full_text_retry_error), ["timeout", "robots"]);
});

test("retries ask HttpClient for same-host redirects only, which re-check robots.txt per hop", () => {
  const retry = readFileSync(join(process.cwd(), "workers/collector/retry.mts"), "utf8");
  assert.match(retry, /fetchFullText\(http, row\.url, limits, \{ redirect: "same-host" \}\)/);
  const fetchSource = readFileSync(join(process.cwd(), "workers/collector/fetch.mts"), "utf8");
  assert.match(fetchSource, /for \(let hop = 0; ; hop\+\+\) \{\s+await this\.assertAllowed\(current\);/);
  assert.match(fetchSource, /if \(next\.host !== host\) return \{ status: res\.status, body \};/);
});
