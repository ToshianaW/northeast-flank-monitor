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

test("a domain shared by two current sources (gov.pl paths) is not attributed to either", () => {
  const shared = buildRegistry(
    [
      { id: "mon", name: "Polish Ministry of National Defence", home_url: "https://www.gov.pl/web/obrona-narodowa", historical_only: false },
      { id: "rcb", name: "Government Security Centre (RCB)", home_url: "https://www.gov.pl/web/rcb", historical_only: false },
      { id: "x", name: "Other", home_url: "https://other.example.org", historical_only: false },
    ],
    { noAiSources: new Set(), leadOnlySources: new Set() },
  );
  assert.deepEqual([...shared.byDomain.keys()], ["other.example.org"]);
  assert.equal(shared.sourceIdFor("Government Security Centre (RCB)"), "rcb", "feeds and listings still resolve by name");
});
