/**
 * The collector never collects historical-only sources (migration 0008). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRegistry, type RegistryRow } from "./registry.mjs";

const rows: RegistryRow[] = [
  { id: "a", name: "Current Outlet", home_url: "https://current.example.org", historical_only: false },
  { id: "b", name: "Archive Outlet", home_url: "https://archive.example.org", historical_only: true },
];
const registry = buildRegistry(rows, { noAiSources: new Set(["Current Outlet"]), leadOnlySources: new Set() });

test("a feed naming a current source resolves to its id", () => {
  assert.equal(registry.sourceIdFor("Current Outlet"), "a");
});

test("a feed naming a historical-only source is refused", () => {
  assert.throws(() => registry.sourceIdFor("Archive Outlet"), /historical-only and is never collected/);
});

test("unknown sources are still refused", () => {
  assert.throws(() => registry.sourceIdFor("Nobody"), /not in the registry/);
});

test("GDELT domain attribution leaves historical-only sources out", () => {
  assert.deepEqual([...registry.byDomain.keys()], ["current.example.org"]);
  assert.equal(registry.byDomain.get("current.example.org")?.noAi, true);
});
