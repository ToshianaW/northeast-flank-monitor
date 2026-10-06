/**
 * Latest page filters (pure). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { hasLatestFilters, latestFilterOptions, matchesLatest, parseLatestFilters } from "./latest-filters";

const ev = (event_type: string, country: string | null, headline: string, summary: string | null = null) => ({
  event_type: event_type as never,
  country,
  headline,
  summary,
  location_name: null,
  actor: null,
});
const events = [
  ev("DRONE_ACTIVITY", "Lithuania", "Drone lands on farm field", "Belarusian cigarettes on board."),
  ev("DRONE_ACTIVITY", "Poland", "Drone sighted near Łódź"),
  ev("EXERCISE", "Estonia", "Steadfast Duel 26 begins"),
  ev("BORDER_INCIDENT", null, "Border checks in Valga"),
];

test("options: only types and countries present, with counts, most frequent first", () => {
  const o = latestFilterOptions(events);
  assert.deepEqual(o.types.map((t) => [t.value, t.count]), [["DRONE_ACTIVITY", 2], ["BORDER_INCIDENT", 1], ["EXERCISE", 1]]);
  assert.deepEqual(o.countries.map((c) => c.value), ["Estonia", "Lithuania", "Poland"]);
});

test("filters by type, country and words (any case, no diacritics needed); unknown values ignored", () => {
  const o = latestFilterOptions(events);
  const run = (params: Record<string, string>) =>
    events.filter((e) => matchesLatest(e, parseLatestFilters(params, o))).map((e) => e.headline);
  assert.deepEqual(run({ type: "DRONE_ACTIVITY" }), ["Drone lands on farm field", "Drone sighted near Łódź"]);
  assert.deepEqual(run({ type: "DRONE_ACTIVITY", country: "poland" }), ["Drone sighted near Łódź"]);
  assert.deepEqual(run({ q: "lodz" }), ["Drone sighted near Łódź"]);
  assert.deepEqual(run({ q: "cigarettes drone" }), ["Drone lands on farm field"], "every word, in the summary too");
  assert.equal(run({ type: "NOT_A_TYPE", country: "Narnia" }).length, 4, "unknown values show everything");
  assert.equal(hasLatestFilters(parseLatestFilters({}, o)), false);
  assert.equal(hasLatestFilters(parseLatestFilters({ q: "  " }, o)), false);
});
