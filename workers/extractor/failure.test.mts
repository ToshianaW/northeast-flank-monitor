/**
 * Extractor row outcomes: the text limit, skip and failure labels, and the exit code.
 * No database or API calls. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { exitCodeFor, failureReason, MAX_TEXT_CHARS, skipKindFor, skippedSummary } from "./failure.mjs";

test("the text limit is 60,000 characters; over it the row is skipped as text_too_long", () => {
  assert.equal(MAX_TEXT_CHARS, 60_000);
  assert.equal(skipKindFor("x".repeat(44_885)), null, "the row stuck at 40,000 is now extracted");
  assert.equal(skipKindFor("x".repeat(60_000)), null);
  assert.equal(skipKindFor("x".repeat(60_001)), "text_too_long");
  assert.equal(skipKindFor(""), null);
});

test("labels with counts, in first-seen order; empty when there are none", () => {
  assert.equal(failureReason([]), "");
  assert.equal(skippedSummary([]), "");
  assert.equal(skippedSummary([{ kind: "text_too_long" }, { kind: "text_too_long" }]), "text_too_long (2)");
  assert.equal(
    failureReason([{ kind: "api_error" }, { kind: "write_failed" }, { kind: "api_error" }]),
    "api_error (2), write_failed (1)",
  );
});

test("skips never fail the step; real errors do", () => {
  assert.equal(exitCodeFor([]), 0, "a run with only skipped rows exits 0");
  assert.equal(exitCodeFor([{ kind: "api_error" }]), 1);
  assert.equal(exitCodeFor([{ kind: "write_failed" }]), 1);
});

test("the extractor wires skips and errors as above", () => {
  const extract = readFileSync(join(process.cwd(), "workers/extractor/extract.mts"), "utf8");
  const errorSets = extract.match(/result\.error = /g)?.length ?? 0;
  assert.equal(extract.match(/result\.errorKind = /g)?.length ?? 0, errorSets, "each result.error has a kind");
  assert.ok(!/result\.error = `text is/.test(extract), "an over-length row is no longer an error");
  assert.match(extract, /UPDATE raw_documents SET status = 'SKIPPED',\s+metadata = metadata \|\| jsonb_build_object\('skip_reason'/);
  assert.match(extract, /skips\.push\(/);
  assert.match(extract, /process\.exitCode = exitCodeFor\(errors\);/, "exit code from errors only");
  assert.ok(!/exitCodeFor\(skips\)|errors\.push\(\{[^}]*kind: skipKind/.test(extract));
  assert.match(extract, /setOutput\("skipped", skippedSummary\(skips\)\)/);
  assert.match(extract, /setOutput\("failure_reason", failureReason\(errors\)\)/);

  const workflow = readFileSync(join(process.cwd(), ".github/workflows/daily.yml"), "utf8");
  assert.match(workflow, /EXTRACT_SKIPPED: \$\{\{ steps\.extract\.outputs\.skipped \}\}/);
  assert.match(workflow, /skipped: \$EXTRACT_SKIPPED/);
  assert.match(workflow, /row errors: \$EXTRACT_REASON/);
});
