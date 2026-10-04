/**
 * historical_analogue and historical_notes: internal only, and checked for predictive and
 * comparison wording when saved in admin. No database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { historicalFieldErrors } from "./events";
import { PUBLIC_EVENT_COLUMNS } from "./public-events";

const FIELDS = /historical_analogue|historical_notes/;

test("neither field is selected by public reads or rendered on a public page", () => {
  assert.ok(!FIELDS.test(PUBLIC_EVENT_COLUMNS));
  for (const path of ["src/app/(public)/events/[id]/page.tsx", "src/lib/public-events.ts", "src/lib/public-exercises.ts"]) {
    assert.ok(!FIELDS.test(readFileSync(join(process.cwd(), path), "utf8")), path);
  }
});

test("saving rejects predictive or comparison wording in either field", () => {
  assert.deepEqual(historicalFieldErrors({ historical_analogue: "", historical_notes: "" }), {});
  assert.deepEqual(
    historicalFieldErrors({ historical_analogue: "Zapad-2021 exercise series", historical_notes: "Reviewer note: see Jan 2021 entries." }),
    {},
  );
  assert.match(historicalFieldErrors({ historical_analogue: "Similar to January 2021", historical_notes: "" }).historical_analogue!, /comparison wording "Similar"/);
  assert.match(historicalFieldErrors({ historical_analogue: "", historical_notes: "An early stage of the buildup." }).historical_notes!, /comparison wording/);
  assert.match(historicalFieldErrors({ historical_analogue: "", historical_notes: "An invasion is imminent." }).historical_notes!, /predictive phrase "imminent"/);
  assert.match(historicalFieldErrors({ historical_analogue: "Phase 2", historical_notes: "" }).historical_analogue!, /comparison wording/);
});
