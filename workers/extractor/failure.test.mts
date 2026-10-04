/**
 * Extractor failure labels for the job summary. No database or API calls. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { failureReason } from "./failure.mjs";

test("labels with counts, in first-seen order; empty when there are no row errors", () => {
  assert.equal(failureReason([]), "");
  assert.equal(failureReason([{ kind: "text_too_long" }]), "text_too_long (1)");
  assert.equal(
    failureReason([{ kind: "api_error" }, { kind: "text_too_long" }, { kind: "api_error" }]),
    "api_error (2), text_too_long (1)",
  );
});

test("every row error in the extractor carries a kind, and the summary shows the reason", () => {
  const extract = readFileSync(join(process.cwd(), "workers/extractor/extract.mts"), "utf8");
  const errorSets = extract.match(/result\.error = /g)?.length ?? 0;
  const kindSets = extract.match(/result\.errorKind = /g)?.length ?? 0;
  assert.ok(errorSets > 0);
  assert.equal(kindSets, errorSets, "each result.error is paired with result.errorKind");
  assert.match(extract, /setOutput\("failure_reason", failureReason\(errors\)\)/);
  assert.match(extract, /if \(errors\.length > 0\) process\.exitCode = 1;/, "the exit code is unchanged");
  const workflow = readFileSync(join(process.cwd(), ".github/workflows/daily.yml"), "utf8");
  assert.match(workflow, /EXTRACT_REASON: \$\{\{ steps\.extract\.outputs\.failure_reason \}\}/);
  assert.match(workflow, /row errors: \$EXTRACT_REASON/);
});
