/**
 * Extractor spend limits: rolling 24-hour budget, per-run cap as a minimum, rows that do not fit
 * are deferred (not blocking), rows that can never fit are skipped, and a clean exit when the
 * budget is used up. No database or API calls. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DAILY_BUDGET_USD, effectiveCap, PER_RUN_CAP_USD, rowBudgetDecision } from "./budget.mjs";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test("limits: $0.12 per run, $0.60 per rolling 24 hours", () => {
  assert.equal(PER_RUN_CAP_USD, 0.12);
  assert.equal(DAILY_BUDGET_USD, 0.6);
});

test("rolling budget: nothing spent, partly spent, exhausted", () => {
  const none = effectiveCap(0.12, 0.6, 0);
  close(none.cap, 0.12);
  assert.equal(none.exhausted, false);
  const partly = effectiveCap(0.12, 0.6, 0.55);
  close(partly.cap, 0.05);
  assert.equal(partly.exhausted, false);
  for (const spent of [0.6, 0.65, 0.59995]) {
    const done = effectiveCap(0.12, 0.6, spent);
    assert.equal(done.exhausted, true, `spent ${spent}`);
  }
  assert.equal(effectiveCap(0.12, 0.6, 0.7).cap, 0, "never negative");
});

test("the cap is the minimum of the per-run cap and what is left of the budget", () => {
  close(effectiveCap(0.12, 0.6, 0.3).cap, 0.12);
  close(effectiveCap(0.12, 0.6, 0.52).cap, 0.08);
  close(effectiveCap(0.05, 0.6, 0).cap, 0.05);
});

test("a row that does not fit what is left is deferred, and later rows still process", () => {
  // Effective cap $0.10. Rows (estimates): 0.05 runs, 0.07 no longer fits, 0.03 still fits.
  const estimates = [0.05, 0.07, 0.03];
  let spent = 0;
  const outcome = estimates.map((estimate) => {
    const d = rowBudgetDecision(estimate, spent, 0.1, 0.12);
    if (d === "process") spent += estimate;
    return d;
  });
  assert.deepEqual(outcome, ["process", "over_run_cap", "process"]);
});

test("a row estimated above the per-run cap itself is skipped permanently", () => {
  assert.equal(rowBudgetDecision(0.13, 0, 0.12, 0.12), "too_long_for_cap");
  assert.equal(rowBudgetDecision(0.13, 0, 0.05, 0.12), "too_long_for_cap", "even when little is left");
  // The 44,885-character row from 4 Oct (Sonnet 5.5: $2 in, $10 out per million) fits the per-run cap.
  const estimate = ((44_885 / 3 + 2_500) * 2 + 4_000 * 10) / 1_000_000;
  assert.equal(rowBudgetDecision(estimate, 0, 0.12, 0.12), "process");
});

test("extract.mts: clean exit when the budget is used up; deferred rows do not stop the loop", () => {
  const source = readFileSync(join(process.cwd(), "workers/extractor/extract.mts"), "utf8");
  const exhausted = source.indexOf("if (budget.exhausted) {");
  const insert = source.indexOf("INSERT INTO extraction_runs");
  assert.ok(exhausted > 0 && exhausted < insert, "stops before recording a run or calling the model");
  const block = source.slice(exhausted, insert);
  assert.match(block, /setOutput\("stop_reason", "DAILY_BUDGET"\)/);
  assert.match(block, /process\.exit\(0\)/, "exits 0");
  assert.match(source, /if \(decision === "over_run_cap"\) \{[\s\S]*?continue;\s*\}/, "deferred rows continue, not break");
  assert.match(source, /'skip_reason', 'text_too_long_for_cap'/);
  assert.match(source, /WHERE started_at > now\(\) - interval '24 hours'/);
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/daily.yml"), "utf8");
  assert.match(workflow, /--max-usd 0\.12 --ci/);
  assert.match(workflow, /stop: daily budget reached/);
});
