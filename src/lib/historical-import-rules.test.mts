/**
 * Candidate file rules for the import page (no database, no files). Run: npm test
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  groupDuplicates,
  headlineSimilarity,
  importInternalNotes,
  isSafeCandidateFileName,
  matchRegistry,
  parseCandidateFile,
  type ImportCandidate,
} from "./historical-import-rules";

const candidate: ImportCandidate = {
  id: "abc123def456",
  url: "https://www.osw.waw.pl/en/publikacje/analyses/2021-04-28/troops-withdrawing",
  publisher: "OSW",
  event_date: "2021-04-22",
  reported_date: "2021-04-28",
  date_rule: "year from the publication date 2021-04-28 (page metadata), 6 day(s) after the event",
  date_quote: "On 22 April, the so-called active phase",
  event_type: "TROOP_MOVEMENT",
  headline: "Shoigu announces end of readiness test near Ukraine",
  summary: "Russia's defence minister said units would return to their bases.",
  actor: "Sergei Shoigu",
  country: "Russia",
  location_name: null,
  exercise_name: null,
  excerpt: "Shoigu stated that the subunits involved in the test would begin withdrawing",
  excerpt_supports: "Shoigu said units would begin withdrawing.",
  flags: ["Page has no publication date in its metadata."],
  accessed_at: "2026-10-03",
};
const file = { version: 1, generated_at: "2026-10-03T10:00:00Z", prompt_version: "historical-suggest-v3", model: "claude-sonnet-5-5", period: "2021-01:2021-04", mode: "urls", candidates: [candidate] };

test("candidate file names: plain .json names only", () => {
  assert.ok(isSafeCandidateFileName("osw-2021-01_2021-04.json"));
  for (const bad of ["../secrets.json", "a/b.json", ".hidden.json", "x.txt", "..json", "x..json", "C:\\x.json", ""]) {
    assert.ok(!isSafeCandidateFileName(bad), bad);
  }
});

test("parseCandidateFile accepts a well-formed file and rejects malformed ones", () => {
  assert.ok(parseCandidateFile(file).ok);
  const bad = (patch: Record<string, unknown>, c: Partial<Record<keyof ImportCandidate, unknown>> = {}) =>
    parseCandidateFile({ ...file, ...patch, candidates: [{ ...candidate, ...c }] });
  assert.match((bad({ version: 2 }) as { error: string }).error, /version/);
  assert.match((bad({}, { excerpt: "" }) as { error: string }).error, /excerpt missing/);
  assert.match((bad({}, { event_date: "22 April 2021" }) as { error: string }).error, /YYYY-MM-DD/);
  assert.match((bad({}, { event_type: "INVASION" }) as { error: string }).error, /event_type/);
  assert.match((bad({}, { url: "javascript:alert(1)" }) as { error: string }).error, /http/);
  assert.match((bad({}, { flags: "none" }) as { error: string }).error, /flags/);
  assert.match((parseCandidateFile({ ...file, candidates: [candidate, candidate] }) as { error: string }).error, /duplicate id/);
});

test("registry matching: same site and home path; otherwise unregistered", () => {
  const registry = [
    { id: "osw", name: "OSW", home_url: "https://www.osw.waw.pl", tier: 2 },
    { id: "pl", name: "Polish MoD", home_url: "https://www.gov.pl/web/obrona-narodowa", tier: 1 },
  ];
  assert.equal(matchRegistry(candidate.url, registry)?.id, "osw");
  assert.equal(matchRegistry("https://www.gov.pl/web/obrona-narodowa/x", registry)?.id, "pl");
  assert.equal(matchRegistry("https://www.gov.pl/web/zdrowie/x", registry), null);
  assert.equal(matchRegistry("https://www.criticalthreats.org/analysis/x", registry), null);
});

test("duplicates: same date and similar headline group together", () => {
  const items = [
    { id: "a", event_date: "2021-04-22", headline: "Shoigu announces end of readiness test near Ukraine" },
    { id: "b", event_date: "2021-04-22", headline: "Shoigu announces the end of the readiness test near Ukraine" },
    { id: "c", event_date: "2021-04-23", headline: "Shoigu announces end of readiness test near Ukraine" },
    { id: "d", event_date: "2021-04-22", headline: "Belarus holds air defence drills" },
  ];
  assert.deepEqual(groupDuplicates(items).map((g) => g.map((i) => i.id)), [["a", "b"], ["c"], ["d"]]);
  assert.ok(headlineSimilarity(items[0].headline, items[1].headline) > 0.8);
  assert.ok(headlineSimilarity(items[0].headline, items[3].headline) < 0.3);
});

test("internal notes keep the support line, date rule and flags", () => {
  const notes = importInternalNotes(candidate, "osw.json");
  assert.match(notes, /What the excerpt supports \(model\): Shoigu said units would begin withdrawing\./);
  assert.match(notes, /Date rule: year from the publication date/);
  assert.match(notes, /Flags: Page has no publication date/);
  assert.match(notes, /osw\.json/);
});
