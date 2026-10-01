import "server-only";
import { getPool } from "@/lib/db";

/** Spec §16 digest sections, in display order. */
export const DIGEST_SECTIONS = [
  { key: "executive_summary", label: "Executive Summary" },
  { key: "belarus", label: "Belarus" },
  { key: "kaliningrad", label: "Kaliningrad" },
  { key: "nato_northeast_flank", label: "NATO Northeast Flank" },
  { key: "air_activity", label: "Air Activity" },
  { key: "border_hybrid_activity", label: "Border / Hybrid Activity" },
  { key: "post_exercise_assessment", label: "Post-Exercise Assessment" },
  { key: "historical_context", label: "Historical Context" },
  {
    key: "contradictions_unverified",
    label: "Contradictions & Unverified Reporting",
  },
] as const;

export type DigestSectionKey = (typeof DIGEST_SECTIONS)[number]["key"];

export type DigestSections = Record<DigestSectionKey, string>;

/** Manual digests use only these two of the review_status values. */
export const DIGEST_STATUS_VALUES = ["DRAFT", "PUBLISHED"] as const;

export type DigestStatus = (typeof DIGEST_STATUS_VALUES)[number];

export const DEFAULT_DIGEST_TITLE = "Northeast Flank Daily Digest";

export type Digest = {
  id: string;
  /** YYYY-MM-DD, read as text so no time zone shifts the day. */
  digest_date: string;
  title: string;
  sections: DigestSections;
  review_status: DigestStatus;
  updated_at: Date;
};

export type DigestListItem = Pick<Digest, "id" | "digest_date" | "title" | "review_status">;

export type DigestField = "digest_date" | "title" | "review_status" | DigestSectionKey;

export type DigestFormValues = Record<DigestField, string>;

export type DigestFormErrors = Partial<Record<DigestField, string>>;

export type DigestInput = Omit<Digest, "id" | "updated_at">;

export type DigestValidationResult =
  | { ok: true; input: DigestInput }
  | { ok: false; errors: DigestFormErrors };

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SECTION_MAX_LENGTH = 20000;

const COLUMNS =
  "id, digest_date::text AS digest_date, title, sections, review_status, updated_at";

/** True for a real calendar date in YYYY-MM-DD form. */
export function isValidDigestDate(value: string): boolean {
  if (!DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function normalizeSections(raw: unknown): DigestSections {
  const obj = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return Object.fromEntries(
    DIGEST_SECTIONS.map(({ key }) => [
      key,
      typeof obj[key] === "string" ? (obj[key] as string) : "",
    ]),
  ) as DigestSections;
}

function rowToDigest(row: Digest): Digest {
  return { ...row, sections: normalizeSections(row.sections) };
}

export function emptyDigestFormValues(): DigestFormValues {
  const values = {
    digest_date: new Date().toISOString().slice(0, 10),
    title: DEFAULT_DIGEST_TITLE,
    review_status: "DRAFT",
  } as DigestFormValues;
  for (const { key } of DIGEST_SECTIONS) values[key] = "";
  return values;
}

export function digestFormValuesFromDigest(digest: Digest): DigestFormValues {
  return {
    digest_date: digest.digest_date,
    title: digest.title,
    review_status: digest.review_status,
    ...digest.sections,
  };
}

export function digestFormValuesFrom(formData: FormData): DigestFormValues {
  const get = (key: DigestField) => String(formData.get(key) ?? "");
  const values = {
    digest_date: get("digest_date"),
    title: get("title"),
    review_status: get("review_status"),
  } as DigestFormValues;
  for (const { key } of DIGEST_SECTIONS) values[key] = get(key);
  return values;
}

export function validateDigest(values: DigestFormValues): DigestValidationResult {
  const errors: DigestFormErrors = {};

  const digest_date = values.digest_date.trim();
  if (!digest_date) errors.digest_date = "Digest date is required.";
  else if (!isValidDigestDate(digest_date)) {
    errors.digest_date = "Use a real date in YYYY-MM-DD form.";
  }

  const title = values.title.trim();
  if (!title) errors.title = "Title is required.";
  else if (title.length > 200) errors.title = "Keep the title under 200 characters.";

  if (!DIGEST_STATUS_VALUES.includes(values.review_status as DigestStatus)) {
    errors.review_status = "Choose Draft or Published.";
  }

  const sections = {} as DigestSections;
  for (const { key, label } of DIGEST_SECTIONS) {
    // Keep internal line breaks; only trim the ends.
    const text = values[key].replace(/\r\n/g, "\n").trim();
    if (text.length > SECTION_MAX_LENGTH) {
      errors[key] = `Keep ${label} under ${SECTION_MAX_LENGTH.toLocaleString("en-US")} characters.`;
    }
    sections[key] = text;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    input: {
      digest_date,
      title,
      sections,
      review_status: values.review_status as DigestStatus,
    },
  };
}

// ---------------------------------------------------------------------------
// Admin reads and writes
// ---------------------------------------------------------------------------

export async function listDigests(): Promise<DigestListItem[]> {
  const { rows } = await getPool().query<DigestListItem>(
    `SELECT id, digest_date::text AS digest_date, title, review_status
     FROM daily_digests
     ORDER BY digest_date DESC`,
  );
  return rows;
}

export async function getDigest(id: string): Promise<Digest | null> {
  if (!UUID_RE.test(id)) return null;
  const { rows } = await getPool().query<Digest>(
    `SELECT ${COLUMNS} FROM daily_digests WHERE id = $1`,
    [id],
  );
  return rows[0] ? rowToDigest(rows[0]) : null;
}

export async function createDigest(input: DigestInput): Promise<string> {
  const { rows } = await getPool().query<{ id: string }>(
    `INSERT INTO daily_digests (digest_date, title, sections, review_status)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [input.digest_date, input.title, JSON.stringify(input.sections), input.review_status],
  );
  return rows[0].id;
}

export async function updateDigest(id: string, input: DigestInput): Promise<boolean> {
  if (!UUID_RE.test(id)) return false;
  const { rowCount } = await getPool().query(
    `UPDATE daily_digests
     SET digest_date = $1, title = $2, sections = $3, review_status = $4
     WHERE id = $5`,
    [input.digest_date, input.title, JSON.stringify(input.sections), input.review_status, id],
  );
  return rowCount === 1;
}

// ---------------------------------------------------------------------------
// Public reads: PUBLISHED only
// ---------------------------------------------------------------------------

export async function listPublishedDigests(): Promise<DigestListItem[]> {
  const { rows } = await getPool().query<DigestListItem>(
    `SELECT id, digest_date::text AS digest_date, title, review_status
     FROM daily_digests
     WHERE review_status = 'PUBLISHED'
     ORDER BY digest_date DESC`,
  );
  return rows;
}

export async function getLatestPublishedDigest(): Promise<Digest | null> {
  const { rows } = await getPool().query<Digest>(
    `SELECT ${COLUMNS} FROM daily_digests
     WHERE review_status = 'PUBLISHED'
     ORDER BY digest_date DESC
     LIMIT 1`,
  );
  return rows[0] ? rowToDigest(rows[0]) : null;
}

export async function getPublishedDigestByDate(date: string): Promise<Digest | null> {
  if (!isValidDigestDate(date)) return null;
  const { rows } = await getPool().query<Digest>(
    `SELECT ${COLUMNS} FROM daily_digests
     WHERE digest_date = $1::date AND review_status = 'PUBLISHED'`,
    [date],
  );
  return rows[0] ? rowToDigest(rows[0]) : null;
}
