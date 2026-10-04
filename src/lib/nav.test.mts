/**
 * Sidebar active item and top-bar title. No database. Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { activeNavItem, NAV_GROUPS, pageTitleFor } from "./nav";

test("the side-by-side view is in the sidebar under Activity", () => {
  const activity = NAV_GROUPS.find((g) => g.id === "activity")!;
  assert.ok(activity.items.some((i) => i.href === "/historical/compare" && i.label === "Side-by-side view"));
});

test("the longest matching href is the active item", () => {
  assert.equal(activeNavItem("/historical/compare")?.href, "/historical/compare");
  assert.equal(activeNavItem("/historical")?.href, "/historical");
  assert.equal(activeNavItem("/historical/type/exercise")?.href, "/historical");
  assert.equal(activeNavItem("/")?.href, "/");
  assert.equal(activeNavItem("/nowhere"), null);
});

test("top-bar titles", () => {
  assert.equal(pageTitleFor("/historical/compare"), "Side-by-side view");
  assert.equal(pageTitleFor("/historical/2b4c"), "Historical Comparison");
  assert.equal(pageTitleFor("/events/abc"), "Event");
  assert.equal(pageTitleFor("/nowhere"), "Northeast Flank Monitor");
});
