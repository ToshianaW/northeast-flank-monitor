/**
 * Candidate files from the historical suggester (workers/historical/suggest.mts --out) and the
 * import page's pure rules: file shape, safe file names, registry matching, duplicate grouping.
 * No database or file access here.
 */
import { EVENT_TYPE_VALUES } from "@/lib/event-labels";

export const CANDIDATE_FILE_VERSION = 1;

export type ImportCandidate = {
  /** Stable within a file: hash of URL, event date and headline. */
  id: string;
  url: string;
  publisher: string;
  event_date: string;
  /** The page's publication date when known. */
  reported_date: string | null;
  /** Which rule supplied the year (from verify.mts). */
  date_rule: string;
  date_quote: string;
  event_type: string;
  headline: string;
  summary: string;
  actor: string | null;
  country: string | null;
  location_name: string | null;
  exercise_name: string | null;
  excerpt: string;
  /** The model's one-line "what the excerpt supports". */
  excerpt_supports: string;
  flags: string[];
  /** When the worker fetched the page (YYYY-MM-DD). */
  accessed_at: string;
};

export type CandidateFile = {
  version: number;
  generated_at: string;
  prompt_version: string;
  model: string;
  period: string;
  mode: "search" | "urls";
  candidates: ImportCandidate[];
};

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Only plain file names inside the candidates folder: no paths, no dot-files, .json only. */
export function isSafeCandidateFileName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,120}\.json$/.test(name) && !name.includes("..");
}

const str = (v: unknown) => typeof v === "string";
const strOrNull = (v: unknown) => v === null || typeof v === "string";

/** Validates a parsed candidates file; malformed candidates make the whole file invalid. */
export function parseCandidateFile(raw: unknown): { ok: true; file: CandidateFile } | { ok: false; error: string } {
  if (typeof raw !== "object" || raw === null) return { ok: false, error: "not a JSON object" };
  const f = raw as Record<string, unknown>;
  if (f.version !== CANDIDATE_FILE_VERSION) return { ok: false, error: `unsupported version ${String(f.version)}` };
  if (!str(f.generated_at) || !str(f.prompt_version) || !str(f.model) || !str(f.period)) {
    return { ok: false, error: "missing file metadata" };
  }
  if (f.mode !== "search" && f.mode !== "urls") return { ok: false, error: "mode must be search or urls" };
  if (!Array.isArray(f.candidates)) return { ok: false, error: "candidates must be a list" };
  const seen = new Set<string>();
  for (const [i, c] of (f.candidates as Array<Record<string, unknown>>).entries()) {
    const where = `candidate ${i + 1}`;
    if (typeof c !== "object" || c === null) return { ok: false, error: `${where}: not an object` };
    for (const k of ["id", "url", "publisher", "event_date", "date_rule", "date_quote", "event_type", "headline", "summary", "excerpt", "excerpt_supports", "accessed_at"]) {
      if (!str(c[k]) || !(c[k] as string).trim()) return { ok: false, error: `${where}: ${k} missing` };
    }
    for (const k of ["reported_date", "actor", "country", "location_name", "exercise_name"]) {
      if (!strOrNull(c[k])) return { ok: false, error: `${where}: ${k} must be text or null` };
    }
    if (!Array.isArray(c.flags) || !c.flags.every(str)) return { ok: false, error: `${where}: flags must be a list of text` };
    if (!ISO_DAY.test(c.event_date as string) || !ISO_DAY.test(c.accessed_at as string)) return { ok: false, error: `${where}: dates must be YYYY-MM-DD` };
    if (c.reported_date !== null && !ISO_DAY.test(c.reported_date as string)) return { ok: false, error: `${where}: reported_date must be YYYY-MM-DD` };
    if (!(EVENT_TYPE_VALUES as readonly string[]).includes(c.event_type as string)) return { ok: false, error: `${where}: unknown event_type` };
    try {
      if (!/^https?:$/.test(new URL(c.url as string).protocol)) throw new Error();
    } catch {
      return { ok: false, error: `${where}: url must be http(s)` };
    }
    if (seen.has(c.id as string)) return { ok: false, error: `${where}: duplicate id` };
    seen.add(c.id as string);
  }
  return { ok: true, file: f as unknown as CandidateFile };
}

export type RegistryEntry = { id: string; name: string; home_url: string | null; tier: number | null };

const hostOf = (url: string) => new URL(url).hostname.toLowerCase().replace(/^www\./, "");

/** The registry source for a URL: same site (subdomains included), and the home URL's path if it has one. */
export function matchRegistry(url: string, registry: RegistryEntry[]): RegistryEntry | null {
  const host = hostOf(url);
  const path = new URL(url).pathname.toLowerCase();
  return (
    registry.find((s) => {
      if (!s.home_url) return false;
      const home = hostOf(s.home_url);
      const homePath = new URL(s.home_url).pathname.replace(/\/+$/, "").toLowerCase();
      return (host === home || host.endsWith(`.${home}`)) && (!homePath || path.startsWith(homePath));
    }) ?? null
  );
}

function bigrams(text: string): string[] {
  const t = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const out: string[] = [];
  for (let i = 0; i < t.length - 1; i++) out.push(t.slice(i, i + 2));
  return out;
}

/** Dice coefficient on character bigrams, 0..1. */
export function headlineSimilarity(a: string, b: string): number {
  const x = bigrams(a);
  const y = bigrams(b);
  if (!x.length || !y.length) return 0;
  const counts = new Map<string, number>();
  for (const g of x) counts.set(g, (counts.get(g) ?? 0) + 1);
  let shared = 0;
  for (const g of y) {
    const n = counts.get(g) ?? 0;
    if (n > 0) {
      shared += 1;
      counts.set(g, n - 1);
    }
  }
  return (2 * shared) / (x.length + y.length);
}

/** Same event date and headline similarity at or above this: shown as one duplicate group. */
export const DUPLICATE_SIMILARITY = 0.55;

/** Groups candidates that look like the same event, preserving file order. */
export function groupDuplicates<T extends { id: string; event_date: string; headline: string }>(items: T[]): T[][] {
  const groups: T[][] = [];
  for (const item of items) {
    const group = groups.find(
      (g) => g[0].event_date === item.event_date && g.some((o) => headlineSimilarity(o.headline, item.headline) >= DUPLICATE_SIMILARITY),
    );
    if (group) group.push(item);
    else groups.push([item]);
  }
  return groups;
}

/** Reviewer-only notes saved with an imported draft: the model's support line, date rule and flags. */
export function importInternalNotes(c: ImportCandidate, fileName: string): string {
  return [
    `Imported from ${fileName} (candidate ${c.id}).`,
    `What the excerpt supports (model): ${c.excerpt_supports}`,
    `Date rule: ${c.date_rule}. Date quote: "${c.date_quote}"`,
    ...(c.flags.length ? [`Flags: ${c.flags.join(" ")}`] : []),
  ].join("\n");
}
