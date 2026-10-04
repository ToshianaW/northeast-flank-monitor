/**
 * Phase 4 isolation, static half: only the historical modules may name the historical tables,
 * so no current-facing query (Latest, Archive, event pages, map, dashboard, digest, dedup,
 * review, and any later search or sitemap) can read them. The suggester is manual-only: no
 * GitHub Actions workflow may run it. No database needed.
 * Run: npm test
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
/** The historical tables, and the 0010 link table and its log (the only bridge to current events). */
const HISTORICAL_TABLE = /\bhistorical_(events|event_sources|review_actions)\b|\bevent_historical_reference(s|_log)\b/;

/** Paths (repo-relative, forward slashes) allowed to name the historical tables. */
const ALLOWED_PREFIXES = [
  "src/lib/historical.", // historical.ts, historical.testing.mts and these tests
  "src/lib/historical-", // historical-rules.ts
  "src/lib/public-historical.ts",
  "src/app/(public)/historical/",
  "src/app/admin/(console)/historical/",
  "src/components/historical/",
  "workers/historical/",
];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...listFiles(path));
    else if (/\.(ts|tsx|mts|mjs|js)$/.test(name)) out.push(path);
  }
  return out;
}

const rel = (path: string) => relative(ROOT, path).split(sep).join("/");

test("only historical modules name the historical tables", () => {
  const files = ["src", "workers", "scripts"].flatMap((d) => listFiles(join(ROOT, d)));
  assert.ok(files.length > 50, `expected to scan the codebase, found ${files.length} files`);

  const offenders = files
    .map(rel)
    .filter((path) => !ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)))
    .filter((path) => HISTORICAL_TABLE.test(readFileSync(join(ROOT, path), "utf8")));
  assert.deepEqual(offenders, [], `current-facing files reference historical tables: ${offenders.join(", ")}`);
});

test("the allowlist names no current-facing module", () => {
  const current = [
    "src/lib/public-events.ts",
    "src/lib/public-exercises.ts",
    "src/lib/map-data.ts",
    "src/lib/digests.ts",
    "src/lib/review.ts",
    "src/lib/events.ts",
    "src/lib/exercises.ts",
    "src/app/(public)/page.tsx",
    "src/app/(public)/latest/page.tsx",
    "src/app/(public)/archive/page.tsx",
    "src/app/(public)/map/page.tsx",
    "src/app/(public)/events/[id]/page.tsx",
    "src/app/sitemap.ts",
    "workers/digest/input.mts",
    "workers/digest/generate.mts",
    "workers/deduplication/pairs.mts",
  ];
  for (const path of current) {
    assert.ok(!ALLOWED_PREFIXES.some((prefix) => path.startsWith(prefix)), `${path} is allowlisted`);
  }
});

test("the event page and admin reach the link table only through the allowlisted module", () => {
  for (const path of [
    "src/app/(public)/events/[id]/page.tsx",
    "src/app/admin/(console)/events/reference-actions.ts",
    "src/app/admin/(console)/events/[id]/edit/page.tsx",
  ]) {
    const text = readFileSync(join(ROOT, path), "utf8");
    assert.ok(!HISTORICAL_TABLE.test(text), `${path} names a historical table`);
  }
  const page = readFileSync(join(ROOT, "src/app/(public)/events/[id]/page.tsx"), "utf8");
  assert.match(page, /listApprovedReferences\(id\)/);
  assert.ok(!/public-historical|listReferencesForAdmin|shortlistHistorical/.test(page), "public page uses the approved read only");
});

test("no GitHub Actions workflow runs the historical suggester", () => {
  const dir = join(ROOT, ".github", "workflows");
  for (const name of readdirSync(dir)) {
    const text = readFileSync(join(dir, name), "utf8");
    assert.ok(!/workers\/historical|historical:suggest/.test(text), `${name} runs the historical suggester`);
  }
});
