/**
 * Sidebar structure, active item, open state and top-bar title. No database. Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  activeNavItem,
  isNavParent,
  isParentActive,
  isParentOpenByDefault,
  NAV_GROUPS,
  navLinks,
  pageTitleFor,
  type NavParent,
} from "./nav";

const activity = NAV_GROUPS.find((g) => g.id === "activity")!;
const historical = activity.items.find(isNavParent) as NavParent;

test("Historical Comparison is an expandable entry with exactly two children", () => {
  assert.equal(historical.label, "Historical Comparison");
  assert.deepEqual(
    historical.children.map(({ href, label }) => ({ href, label })),
    [
      { href: "/historical", label: "Overview" },
      { href: "/historical/compare", label: "Side-by-side view" },
    ],
  );
  assert.equal(activity.items.indexOf(historical), 2, "same place in the Activity section");
});

test("Side-by-side view is not a top-level item", () => {
  for (const group of NAV_GROUPS) {
    for (const entry of group.items) {
      if (!isNavParent(entry)) assert.notEqual(entry.href, "/historical/compare");
    }
  }
});

test("nothing else in the sidebar changes", () => {
  const shape = NAV_GROUPS.map((g) => [
    g.label,
    g.items.map((e) => (isNavParent(e) ? `${e.label} [${e.children.map((c) => c.label).join(", ")}]` : e.label)),
  ]);
  assert.deepEqual(shape, [
    ["Overview", ["Dashboard", "Map"]],
    ["Reporting", ["Latest", "Digest", "Archive"]],
    ["Activity", ["Exercises", "Air Activity", "Historical Comparison [Overview, Side-by-side view]"]],
    ["Reference", ["Sources", "Methodology", "Open data", "About"]],
  ]);
  assert.equal(navLinks().length, 13);
});

test("active and open states on both pages", () => {
  for (const path of ["/historical", "/historical/compare", "/historical/type/exercise", "/historical/2b4c"]) {
    assert.equal(isParentOpenByDefault(historical, path), true, path);
    assert.equal(isParentActive(historical, path), true, path);
  }
  assert.equal(activeNavItem("/historical")?.href, "/historical");
  assert.equal(activeNavItem("/historical/compare")?.href, "/historical/compare", "longest match: not also Overview");
  assert.equal(activeNavItem("/historical/type/exercise")?.href, "/historical");
  for (const path of ["/", "/latest", "/exercises", "/historicalx"]) {
    assert.equal(isParentOpenByDefault(historical, path), false, path);
    assert.equal(isParentActive(historical, path), false, path);
  }
  assert.equal(activeNavItem("/nowhere"), null);
});

test("top-bar titles", () => {
  assert.equal(pageTitleFor("/historical"), "Historical Comparison");
  assert.equal(pageTitleFor("/historical/compare"), "Side-by-side view");
  assert.equal(pageTitleFor("/historical/2b4c"), "Historical Comparison");
  assert.equal(pageTitleFor("/map"), "Map");
  assert.equal(pageTitleFor("/events/abc"), "Event");
  assert.equal(pageTitleFor("/nowhere"), "Northeast Flank Monitor");
});
