/**
 * Country and month filters and the show-more step (Air Activity and Exercises pages).
 * No database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { filterOptions, matchesFilters, monthLabel, parseListFilters, SHOW_STEP } from "./list-filters";

const items = [
  { countries: ["Poland"], month: "2026-10" },
  { countries: ["Lithuania", "Poland"], month: "2026-09" },
  { countries: [], month: "2026-10" },
  { countries: ["Belarus"], month: null },
];

test("options: countries alphabetical, months newest first", () => {
  assert.deepEqual(filterOptions(items), { countries: ["Belarus", "Lithuania", "Poland"], months: ["2026-10", "2026-09"] });
  assert.equal(monthLabel("2026-10"), "October 2026");
});

test("only known values are kept; anything else shows everything", () => {
  const options = filterOptions(items);
  assert.deepEqual(parseListFilters({ country: "poland", month: "2026-09" }, options), { country: "Poland", month: "2026-09" });
  assert.deepEqual(parseListFilters({ country: "Mars", month: "2027-01" }, options), { country: null, month: null });
  assert.deepEqual(parseListFilters({ country: ["Belarus", "Poland"] }, options), { country: "Belarus", month: null });
});

test("matching: any listed country, and the month when set", () => {
  const f = (country: string | null, month: string | null) => items.filter((i) => matchesFilters(i, { country, month })).length;
  assert.equal(f(null, null), 4);
  assert.equal(f("Poland", null), 2);
  assert.equal(f("Poland", "2026-09"), 1);
  assert.equal(f(null, "2026-10"), 2);
});

test("both pages filter by country and month and show 3 at a time", () => {
  assert.equal(SHOW_STEP, 3);
  for (const [path, action] of [["src/app/(public)/air-activity/page.tsx", "/air-activity"], ["src/app/(public)/exercises/page.tsx", "/exercises"]]) {
    const page = readFileSync(join(process.cwd(), path), "utf8");
    assert.ok(page.includes(`<ListFilterForm action="${action}"`), path);
    assert.match(page, /<ShowMoreList[\s\S]*step=\{SHOW_STEP\}/, path);
  }
  const form = readFileSync(join(process.cwd(), "src/components/list-filter-form.tsx"), "utf8");
  assert.match(form, /method="get"/, "works without JavaScript");
  assert.match(form, /name="country"/);
  assert.match(form, /name="month"/);
});
