/**
 * Exercise evidence rule and reset widget labels (no database).
 * Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  announcedEndHasPassed,
  dimensionDisplay,
  exerciseConstraintMessage,
  followOnDisplay,
  FULL_RESET_ERROR,
  fullResetAllowed,
  hasNonUnknownReset,
  hasResetEvidence,
  NO_EVIDENCE_TEXT,
  overallResetDisplay,
  PUBLISHED_NEEDS_SOURCE_ERROR,
  RESET_ALL_UNKNOWN_TEXT,
  RESET_CAVEAT,
  RESET_EVIDENCE_ERROR,
  RESET_OTHERS_UNKNOWN_TEXT,
  resetWidgetContent,
} from "./exercise-rules";
import { DIMENSION_STATUS_VALUES, RESET_STATUS_VALUES } from "./event-labels";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const allUnknown = {
  post_exercise_reset: "UNKNOWN",
  personnel_return_status: "UNKNOWN",
  equipment_return_status: "UNKNOWN",
  infrastructure_status: "UNKNOWN",
} as const;

test("all UNKNOWN needs no evidence; any other value does", () => {
  assert.equal(hasNonUnknownReset(allUnknown), false);
  assert.equal(hasNonUnknownReset({ ...allUnknown, equipment_return_status: "NOT_VERIFIED" }), true);
  assert.equal(hasNonUnknownReset({ ...allUnknown, post_exercise_reset: "PARTIAL_RESET" }), true);
});

test("a source counts only with a non-empty excerpt", () => {
  const base = { linkedEvents: [], observed_end_date: null, announced_end_date: d("2026-10-02") };
  assert.equal(hasResetEvidence({ ...base, sources: [{ excerpt: "  " }, { excerpt: null }] }), false);
  assert.equal(hasResetEvidence({ ...base, sources: [{ excerpt: "Troops returned to base." }] }), true);
});

test("a linked event counts only if published and dated on or after the end", () => {
  const ev = (date: string, review_status: "PUBLISHED" | "DRAFT" = "PUBLISHED") => ({
    event_date: d(date),
    review_status,
  });
  const base = { sources: [], observed_end_date: null, announced_end_date: d("2026-10-02") };
  assert.equal(hasResetEvidence({ ...base, linkedEvents: [ev("2026-09-29")] }), false);
  assert.equal(hasResetEvidence({ ...base, linkedEvents: [ev("2026-10-02")] }), true);
  assert.equal(hasResetEvidence({ ...base, linkedEvents: [ev("2026-10-05", "DRAFT")] }), false);
  // Observed end takes precedence over announced end.
  assert.equal(
    hasResetEvidence({ ...base, observed_end_date: d("2026-10-06"), linkedEvents: [ev("2026-10-03")] }),
    false,
  );
  // No end date at all: events cannot count.
  assert.equal(
    hasResetEvidence({ ...base, announced_end_date: null, linkedEvents: [ev("2026-10-05")] }),
    false,
  );
});

test("FULL_RESET needs all three dimensions Returned or Removed", () => {
  const full = { ...allUnknown, post_exercise_reset: "FULL_RESET" } as const;
  assert.equal(fullResetAllowed(full), false);
  assert.equal(
    fullResetAllowed({
      ...full,
      personnel_return_status: "RETURNED",
      equipment_return_status: "RETURNED",
      infrastructure_status: "NOT_VERIFIED",
    }),
    false,
  );
  assert.equal(
    fullResetAllowed({
      ...full,
      personnel_return_status: "RETURNED",
      equipment_return_status: "RETURNED",
      infrastructure_status: "REMOVED",
    }),
    true,
  );
  assert.equal(fullResetAllowed({ ...allUnknown, post_exercise_reset: "PARTIAL_RESET" }), true);
});

test("UNKNOWN reads 'Not enough open-source evidence' and is never stable-toned", () => {
  for (const display of [
    dimensionDisplay("UNKNOWN"),
    overallResetDisplay("UNKNOWN"),
    followOnDisplay(null),
    followOnDisplay("   "),
  ]) {
    assert.equal(display.text, NO_EVIDENCE_TEXT);
    assert.equal(display.tone, "tone-neutral");
    assert.notEqual(display.symbol, "✓");
  }
  // No status uses the green "operational" tone.
  for (const v of DIMENSION_STATUS_VALUES) assert.notEqual(dimensionDisplay(v).tone, "tone-operational");
  for (const v of RESET_STATUS_VALUES) assert.notEqual(overallResetDisplay(v).tone, "tone-operational");
});

test("reset widget collapses to one line when nothing has a value", () => {
  assert.deepEqual(resetWidgetContent({ ...allUnknown, follow_on_activity: null }), { kind: "none" });
  assert.deepEqual(resetWidgetContent({ ...allUnknown, follow_on_activity: "  " }), { kind: "none" });
  assert.equal(RESET_ALL_UNKNOWN_TEXT, "Post-exercise reset: not enough open-source evidence yet.");
  assert.equal(RESET_CAVEAT, "Troops returned does not mean the theater reset.");
});

test("reset widget shows only rows with values, then the 'other items' line", () => {
  const partial = resetWidgetContent({
    ...allUnknown,
    personnel_return_status: "RETURNED",
    follow_on_activity: "Continued readiness inspections",
  });
  assert.equal(partial.kind, "partial");
  if (partial.kind !== "partial") return;
  assert.deepEqual(
    partial.rows.map((r) => [r.label, r.display.text]),
    [
      ["Personnel", "Returned"],
      ["Follow-on activity", "Continued readiness inspections"],
    ],
  );
  assert.equal(partial.othersUnknown, true);
  assert.equal(RESET_OTHERS_UNKNOWN_TEXT, "Other items: not enough open-source evidence.");

  const full = resetWidgetContent({
    post_exercise_reset: "FULL_RESET",
    personnel_return_status: "RETURNED",
    equipment_return_status: "RETURNED",
    infrastructure_status: "REMOVED",
    follow_on_activity: "None reported",
  });
  assert.equal(full.kind === "partial" && full.othersUnknown, false);
  // No shown row is ever green / operational, and NOT_VERIFIED stays neutral.
  const nv = resetWidgetContent({ ...allUnknown, equipment_return_status: "NOT_VERIFIED", follow_on_activity: null });
  assert.equal(nv.kind === "partial" && nv.rows[0].display.tone, "tone-neutral");
  if (full.kind === "partial") {
    for (const row of full.rows) assert.notEqual(row.display.tone, "tone-operational");
  }
});

test("end-passed note: ACTIVE/CONCLUDING, announced end before today, no observed end", () => {
  const now = d("2026-10-03");
  const x = {
    exercise_status: "ACTIVE",
    announced_end_date: d("2026-10-02"),
    observed_end_date: null,
  } as const;
  assert.equal(announcedEndHasPassed(x, now), true);
  assert.equal(announcedEndHasPassed({ ...x, exercise_status: "CONCLUDING" }, now), true);
  assert.equal(announcedEndHasPassed({ ...x, exercise_status: "EXTENDED" }, now), false);
  assert.equal(announcedEndHasPassed(x, d("2026-10-02")), false);
  assert.equal(announcedEndHasPassed({ ...x, observed_end_date: d("2026-10-02") }, now), false);
});

test("database constraint errors map to the form messages", () => {
  assert.equal(
    exerciseConstraintMessage({ code: "23514", constraint: "exercises_full_reset_requires_dimensions" }),
    FULL_RESET_ERROR,
  );
  assert.equal(
    exerciseConstraintMessage({ code: "23514", message: "Published exercise x must have at least one source" }),
    PUBLISHED_NEEDS_SOURCE_ERROR,
  );
  assert.equal(
    exerciseConstraintMessage({
      code: "23514",
      message: "Exercise x has a reset status other than UNKNOWN without evidence",
    }),
    RESET_EVIDENCE_ERROR,
  );
  assert.equal(exerciseConstraintMessage({ code: "23505" }), null);
});
