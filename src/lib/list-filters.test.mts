/**
 * Country and month filters and the show-more step (Air Activity and Exercises pages).
 * No database. Run: npm test
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  ADMIN_PAGE_SIZE,
  filterOptions,
  listHref,
  matchesFilters,
  monthLabel,
  paginate,
  parseListFilters,
  SHOW_STEP,
} from "./list-filters";

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

test("admin pages: 20 at a time, page clamped to the pages that exist", () => {
  assert.equal(ADMIN_PAGE_SIZE, 20);
  const rows = Array.from({ length: 74 }, (_, i) => i + 1);
  const p1 = paginate(rows, undefined);
  assert.deepEqual([p1.page, p1.pageCount, p1.from, p1.to, p1.items.length], [1, 4, 1, 20, 20]);
  const p2 = paginate(rows, "2");
  assert.deepEqual([p2.from, p2.to, p2.items[0]], [21, 40, 21]);
  const last = paginate(rows, "4");
  assert.deepEqual([last.from, last.to, last.items.length], [61, 74, 14]);
  assert.equal(paginate(rows, "99").page, 4);
  assert.equal(paginate(rows, "0").page, 1);
  assert.equal(paginate(rows, "abc").page, 1);
  assert.equal(paginate(rows, ["3", "1"]).page, 3);
  const none = paginate([], "2");
  assert.deepEqual([none.page, none.pageCount, none.from, none.to, none.total], [1, 1, 0, 0, 0]);
});

test("admin page links keep the search; page 1 is left out", () => {
  assert.equal(listHref("/admin/events", { country: null, month: null }), "/admin/events");
  assert.equal(listHref("/admin/events", { country: null, month: null }, 2), "/admin/events?page=2");
  assert.equal(
    listHref("/admin/events", { country: "Poland", month: "2026-10" }, 3),
    "/admin/events?country=Poland&month=2026-10&page=3",
  );
  assert.equal(listHref("/admin/digests", { country: null, month: "2026-09" }, 1), "/admin/digests?month=2026-09");
});

test("the admin events, exercises and digests lists are searchable and paged", () => {
  for (const [path, action] of [
    ["src/app/admin/(console)/events/page.tsx", "/admin/events"],
    ["src/app/admin/(console)/exercises/page.tsx", "/admin/exercises"],
    ["src/app/admin/(console)/digests/page.tsx", "/admin/digests"],
  ]) {
    const page = readFileSync(join(process.cwd(), path), "utf8");
    assert.match(page, new RegExp(String.raw`<ListFilterForm\s+action="${action}"`), path);
    assert.match(page, new RegExp(`<ListPager base="${action}"`), path);
    assert.match(page, /paginate\(/, path);
  }
});
