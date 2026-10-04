/**
 * Filters a sitemap URL list written by probe-sitemaps.mts (no network): keeps URLs under a path
 * prefix, dated within a range, whose slug matches the keyword list, and writes a URL-mode file
 * (git-ignored, under data/historical/). Prints counts before and after each filter.
 *
 * Usage: npm run historical:filter-sitemap -- --in data/historical/nato-sitemap-2020-08_2022-02.txt
 *          --prefix /en/news-and-events/articles/ --from 2021-01-01 --to 2021-04-30
 *          --out data/historical/nato-2021-01_2021-04.txt
 */
import { readFileSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";
import { matchesNatoSlug } from "./keywords.mjs";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));
const { values: args } = parseArgs({
  options: { in: { type: "string" }, prefix: { type: "string" }, from: { type: "string" }, to: { type: "string" }, out: { type: "string" } },
});
for (const k of ["in", "prefix", "from", "to", "out"] as const) if (!args[k]) throw new Error(`--${k} is required`);
const outRel = relative(resolve(repoRoot, "data/historical"), resolve(args.out!));
if (!outRel || outRel.startsWith("..") || resolve(outRel) === outRel) throw new Error("--out must be under data/historical/");

/** Pairs of "# YYYY-MM-DD (how)" comment lines and URL lines. */
const lines = readFileSync(args.in!, "utf8").split(/\r?\n/);
const entries: Array<{ date: string; url: string }> = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^# (\d{4}-\d{2}-\d{2}) \(/);
  if (m && lines[i + 1] && !lines[i + 1].startsWith("#")) entries.push({ date: m[1], url: lines[i + 1].trim() });
}
const underPrefix = entries.filter((e) => new URL(e.url).pathname.startsWith(args.prefix!));
const inRange = underPrefix.filter((e) => e.date >= args.from! && e.date <= args.to!);
const kept = inRange.filter((e) => matchesNatoSlug(new URL(e.url).pathname.split("/").filter(Boolean).at(-1) ?? ""));
console.log(`all ${entries.length} · under ${args.prefix} ${underPrefix.length} · ${args.from} to ${args.to} ${inRange.length} · slug keywords ${kept.length}`);
writeFileSync(
  resolve(args.out!),
  `${[`# ${args.in} · ${args.prefix} · ${args.from} to ${args.to} · slug keyword filter (${kept.length} of ${inRange.length})`, ...kept.flatMap((e) => [`# ${e.date}`, e.url])].join("\n")}\n`,
  "utf8",
);
console.log(`Wrote ${kept.length} URL(s) to ${relative(process.cwd(), resolve(args.out!))} (git-ignored).`);
