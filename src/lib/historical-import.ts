import "server-only";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { getPool } from "@/lib/db";
import {
  createHistoricalEvent,
  emptyHistoricalFormValues,
  validateHistoricalForm,
} from "@/lib/historical";
import {
  groupDuplicates,
  headlineSimilarity,
  DUPLICATE_SIMILARITY,
  importInternalNotes,
  isSafeCandidateFileName,
  matchRegistry,
  parseCandidateFile,
  type CandidateFile,
  type ImportCandidate,
  type RegistryEntry,
} from "@/lib/historical-import-rules";

/**
 * Import of suggester candidates as DRAFT historical events (admin only). Reads git-ignored
 * files under data/historical/candidates/. Each saved draft goes through the admin form's
 * validation and audit code. Nothing is published here.
 */

export const CANDIDATES_DIR = join(process.cwd(), "data", "historical", "candidates");

export function listCandidateFiles(): string[] {
  if (!existsSync(CANDIDATES_DIR)) return [];
  return readdirSync(CANDIDATES_DIR).filter(isSafeCandidateFileName).sort().reverse();
}

export function readCandidateFile(name: string): { ok: true; file: CandidateFile } | { ok: false; error: string } {
  if (!isSafeCandidateFileName(name)) return { ok: false, error: "Not a candidates file name." };
  const path = join(CANDIDATES_DIR, name);
  if (!existsSync(path)) return { ok: false, error: "File not found." };
  try {
    return parseCandidateFile(JSON.parse(readFileSync(path, "utf8")));
  } catch {
    return { ok: false, error: "The file is not valid JSON." };
  }
}

export type CandidateStatus = {
  candidate: ImportCandidate;
  source: RegistryEntry | null;
  /** An existing historical event cites the same article for the same date. */
  alreadyImported: string | null;
  /** An existing historical event on the same date with a similar headline. */
  similarExisting: { id: string; headline: string } | null;
};

async function registry(): Promise<RegistryEntry[]> {
  const { rows } = await getPool().query<RegistryEntry>(`SELECT id, name, home_url, tier FROM sources`);
  return rows;
}

/** Registry match and duplicate checks for every candidate, grouped like duplicates. */
export async function candidateStatuses(file: CandidateFile): Promise<CandidateStatus[][]> {
  const sources = await registry();
  const dates = [...new Set(file.candidates.map((c) => c.event_date))];
  const { rows: existing } = await getPool().query<{ event_id: string; event_date: string; headline: string; article_url: string | null }>(
    `SELECT h.event_id, h.event_date::text AS event_date, h.headline, hs.article_url
     FROM historical_events h LEFT JOIN historical_event_sources hs ON hs.event_id = h.event_id
     WHERE h.event_date = ANY($1::date[])`,
    [dates],
  );
  const statuses = file.candidates.map((c): CandidateStatus => {
    const same = existing.filter((e) => e.event_date === c.event_date);
    const imported = same.find((e) => e.article_url === c.url);
    const similar = same.find((e) => headlineSimilarity(e.headline, c.headline) >= DUPLICATE_SIMILARITY);
    return {
      candidate: c,
      source: matchRegistry(c.url, sources),
      alreadyImported: imported?.event_id ?? null,
      similarExisting: similar ? { id: similar.event_id, headline: similar.headline } : null,
    };
  });
  return groupDuplicates(statuses.map((s) => ({ ...s, id: s.candidate.id, event_date: s.candidate.event_date, headline: s.candidate.headline }))).map(
    (g) => g.map(({ candidate, source, alreadyImported, similarExisting }) => ({ candidate, source, alreadyImported, similarExisting })),
  );
}

export type ImportResult = { id: string; headline: string; ok: boolean; message: string; eventId?: string };

/**
 * Saves the selected candidates as DRAFT historical events. Unregistered sources and articles
 * already imported for the same date are refused. The model's support line, date rule and flags
 * go to internal_notes (never public); phase_tag stays empty; confidence starts as Unverified.
 */
export async function importCandidates(
  file: CandidateFile,
  fileName: string,
  selectedIds: string[],
  reviewer: string,
): Promise<ImportResult[]> {
  const groups = await candidateStatuses(file);
  const byId = new Map(groups.flat().map((s) => [s.candidate.id, s]));
  const results: ImportResult[] = [];
  for (const id of [...new Set(selectedIds)]) {
    const status = byId.get(id);
    if (!status) {
      results.push({ id, headline: "", ok: false, message: "Not in this file." });
      continue;
    }
    const c = status.candidate;
    if (!status.source) {
      results.push({ id, headline: c.headline, ok: false, message: "Source not registered." });
      continue;
    }
    if (status.alreadyImported) {
      results.push({ id, headline: c.headline, ok: false, message: "Already imported." });
      continue;
    }
    const values = {
      ...emptyHistoricalFormValues(),
      headline: c.headline,
      summary: c.summary,
      event_date: c.event_date,
      reported_date: c.reported_date ?? "",
      event_type: c.event_type,
      actor: c.actor ?? "",
      country: c.country ?? "",
      location_name: c.location_name ?? "",
      exercise_name: c.exercise_name ?? "",
      confidence_level: "UNVERIFIED",
      phase_tag: "",
      internal_notes: importInternalNotes(c, fileName),
    };
    const rows = [
      {
        source_id: status.source.id,
        article_url: c.url,
        archived_url: "",
        accessed_at: c.accessed_at,
        relationship: "SUPPORTS" as const,
        excerpt: c.excerpt,
      },
    ];
    const validation = await validateHistoricalForm(values, rows, 0);
    if (!validation.ok) {
      results.push({ id, headline: c.headline, ok: false, message: `Fails validation: ${Object.values(validation.errors).join(" ")}` });
      continue;
    }
    const created = await createHistoricalEvent(validation.payload, reviewer);
    results.push(
      created.ok
        ? { id, headline: c.headline, ok: true, message: "Saved as draft.", eventId: created.id }
        : { id, headline: c.headline, ok: false, message: created.error },
    );
  }
  return results;
}
