/**
 * The job summary's spend line: formatting, and a spend step that can never fail the job.
 * No database or API calls. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { formatSpendLine, SPEND_UNAVAILABLE } from "./spend.mjs";

test("spend line: two decimals, both windows", () => {
  assert.equal(
    formatSpendLine({ last24h: 0.4321, last30d: 7.006, digestsWithoutCost: 0 }),
    "API spend: last 24 h $0.43 · last 30 days $7.01",
  );
  assert.equal(formatSpendLine({ last24h: 0, last30d: 0, digestsWithoutCost: 0 }), "API spend: last 24 h $0.00 · last 30 days $0.00");
});

test("spend line says when earlier digests have no recorded cost", () => {
  assert.match(formatSpendLine({ last24h: 0.1, last30d: 1, digestsWithoutCost: 1 }), /\(1 digest drafted before costs were recorded not included\)$/);
  assert.match(formatSpendLine({ last24h: 0.1, last30d: 1, digestsWithoutCost: 3 }), /\(3 digests drafted/);
});

test("daily.yml: the spend step cannot fail the job, and the summary still renders without it", () => {
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/daily.yml"), "utf8");
  const step = workflow.slice(workflow.indexOf("- name: Spend"), workflow.indexOf("- name: Job summary"));
  assert.match(step, /id: spend/);
  assert.match(step, /if: \$\{\{ always\(\) \}\}/);
  assert.match(step, /continue-on-error: true/);
  assert.match(step, /timeout-minutes: \d/);
  assert.match(step, /npm run spend:report -- --ci/);
  assert.match(workflow, /SPEND_LINE: \$\{\{ steps\.spend\.outputs\.line \}\}/);
  assert.ok(workflow.includes(`echo "\${SPEND_LINE:-${SPEND_UNAVAILABLE}}"`), "summary falls back to the unavailable line");
  const report = readFileSync(join(process.cwd(), "workers/spend/report.mts"), "utf8");
  assert.match(report, /catch \(error\)/);
  assert.doesNotMatch(report, /process\.exit\(1\)/);
});
