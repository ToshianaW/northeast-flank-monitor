/**
 * Checks for historical suggester candidates against the page the worker fetched itself.
 * Pure functions: no network, no database. A candidate is kept only when its excerpt is on the
 * page verbatim (20 words or fewer), the page states its date, and the extractor's wording rules
 * pass (workers/extractor/validate.mts). Anything the page does not say is flagged.
 */
import { EVENT_TYPE_VALUES, type EventType } from "@/lib/event-labels";
import { findBannedPhrase } from "@/lib/banned-phrases";
import { domainOf } from "../collector/store.mjs";
import { MAX_EXCERPT_WORDS, normalize, validateEvent } from "../extractor/validate.mjs";
import type { HistoricalCandidate } from "./prompt.mjs";

export type DropReason =
  | "barred source"
  | "fetch failed"
  | "robots.txt disallows"
  | "excerpt not found"
  | "excerpt too long"
  | "no stated date"
  | "date outside month"
  | "banned phrase"
  | "headline claims more than excerpt"
  | "outside region"
  | "headline names the source"
  | "actor not on page"
  | "domain limit"
  | "invalid candidate";

export type RegistrySource = { name: string; home_url: string | null; tier: number | null };

export type DomainPolicy = {
  registry: RegistrySource[];
  /** Domains never fetched or sent to a model (blocked automated access, citation-only, no-AI). */
  barred: Array<{ domain: string; why: string }>;
};

export type DomainCheck =
  | { kind: "barred"; why: string }
  | { kind: "registered"; source: RegistrySource }
  | { kind: "unregistered"; domain: string };

function hostMatches(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/** Barred first; then the registry, where a home URL with a path (gov.pl/web/...) must match that path. */
export function checkDomain(url: string, policy: DomainPolicy): DomainCheck {
  const host = domainOf(url);
  const barred = policy.barred.find((b) => hostMatches(host, b.domain));
  if (barred) return { kind: "barred", why: barred.why };
  const path = new URL(url).pathname.toLowerCase();
  const source = policy.registry.find((s) => {
    if (!s.home_url) return false;
    const home = new URL(s.home_url);
    const homePath = home.pathname.replace(/\/+$/, "").toLowerCase();
    return hostMatches(host, domainOf(s.home_url)) && (!homePath || path.startsWith(homePath));
  });
  return source ? { kind: "registered", source } : { kind: "unregistered", domain: host };
}

const MONTH_WORDS: string[][] = [
  ["january", "jan", "январ", "stycz", "sausio", "janvār", "jaanuar"],
  ["february", "feb", "феврал", "lut", "vasario", "februār", "veebruar"],
  ["march", "mar", "март", "marc", "kovo", "mart", "märts"],
  ["april", "apr", "апрел", "kwie", "balandžio", "aprīl", "aprill"],
  ["may", "мая", "май", "maj", "gegužės", "maij", "mai"],
  ["june", "jun", "июн", "czerw", "birželio", "jūnij", "juuni"],
  ["july", "jul", "июл", "lip", "liepos", "jūlij", "juuli"],
  ["august", "aug", "август", "sierp", "rugpjūčio", "august"],
  ["september", "sep", "сентябр", "wrze", "rugsėjo", "septembr"],
  ["october", "oct", "октябр", "październik", "pazdziernik", "spalio", "oktobr", "oktoober"],
  ["november", "nov", "ноябр", "listopad", "lapkričio", "novembr"],
  ["december", "dec", "декабр", "grud", "gruodžio", "decembr", "detsember"],
];

function numericDate(y: number, m: number, d: number): RegExp {
  const day = `0?${d}`;
  const mm = `0?${m}`;
  return new RegExp(
    `(^|[^\\d])(${day}[./-]${mm}([./-](${y}|${String(y).slice(2)}))?|${mm}/${day}(/${y})?|${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")})([^\\d]|$)`,
  );
}

/**
 * True when `text` states the day and month of this date: the day number and a month word
 * (English, Russian, Polish, Lithuanian, Latvian or Estonian), or numeric d.m / m/d / ISO.
 */
export function statesDayMonth(text: string, isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = text.toLowerCase();
  if (numericDate(y, m, d).test(t)) return true;
  const dayWord = new RegExp(`(^|[^\\d])0?${d}(st|nd|rd|th|-?(го|ого|ая|о))?([^\\d]|$)`);
  const monthWord = MONTH_WORDS[m - 1].some((w) => new RegExp(`(^|[^\\p{L}])${w}`, "u").test(t));
  return dayWord.test(t) && monthWord;
}

/** True when `text` also states the year of this date (in full, or as d.m.yy). */
export function statesYear(text: string, isoDate: string): boolean {
  const [y, m, d] = isoDate.split("-").map(Number);
  const t = text.toLowerCase();
  return t.includes(String(y)) || (numericDate(y, m, d).test(t) && new RegExp(`[./-]${String(y).slice(2)}([^\\d]|$)`).test(t));
}

const EN_MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];

function toIso(y: number, m: number, d: number): string | null {
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
}

/** First full date in `text` ("January 28, 2021", "28 January 2021", "2021-01-28", "28.01.2021"). */
function firstFullDate(text: string): string | null {
  const months = EN_MONTHS.join("|");
  const patterns: Array<[RegExp, (m: RegExpMatchArray) => string | null]> = [
    [new RegExp(`\\b(${months})\\s+(\\d{1,2}),?\\s+(20\\d\\d)\\b`, "i"), (x) => toIso(+x[3], EN_MONTHS.indexOf(x[1].toLowerCase()) + 1, +x[2])],
    [new RegExp(`\\b(\\d{1,2})\\s+(${months})\\s+(20\\d\\d)\\b`, "i"), (x) => toIso(+x[3], EN_MONTHS.indexOf(x[2].toLowerCase()) + 1, +x[1])],
    [/\b(20\d\d)-(\d{2})-(\d{2})\b/, (x) => toIso(+x[1], +x[2], +x[3])],
    [/\b(\d{1,2})\.(\d{1,2})\.(20\d\d)\b/, (x) => toIso(+x[3], +x[2], +x[1])],
  ];
  let best: { at: number; iso: string } | null = null;
  for (const [re, parse] of patterns) {
    const match = text.match(re);
    const iso = match ? parse(match) : null;
    if (match && iso && (!best || match.index! < best.at)) best = { at: match.index!, iso };
  }
  return best?.iso ?? null;
}

/**
 * The page's publication date from its visible text: a date after "Published", "Posted",
 * "Date" or "Updated", or else the first full date in the opening 1,500 characters.
 */
export function publishedDateFromText(text: string): string | null {
  const labelled = text.match(/\b(published|posted|date|updated)\b[:\s]+(.{0,40})/i);
  const fromLabel = labelled ? firstFullDate(labelled[2]) : null;
  return fromLabel ?? firstFullDate(text.slice(0, 1500));
}

export const PUBLICATION_WINDOW_DAYS = 14;

export type DateResolution =
  | { ok: true; rule: string; reportedDate: string | null }
  | { ok: false; detail: string };

/**
 * Decides whether the page states the candidate's date. The date quote must state the day and
 * month. The year then comes from the quote itself, or from the page's publication date (metadata,
 * else page text) when the event falls within 14 days before that publication date.
 */
export function resolveDate(
  dateQuote: string,
  eventDate: string,
  page: { html: string; text: string },
): DateResolution {
  if (!statesDayMonth(dateQuote, eventDate)) {
    return { ok: false, detail: `date quote does not state the day and month of ${eventDate}` };
  }
  const meta = publishedDateFromHtml(page.html);
  const fromText = meta ? null : publishedDateFromText(page.text);
  const published = meta ?? fromText;
  const via = meta ? "page metadata" : "page text";
  if (statesYear(dateQuote, eventDate)) {
    return { ok: true, rule: "year stated in the date quote", reportedDate: published };
  }
  if (!published) {
    return { ok: false, detail: "date quote has no year, and the page shows no publication date" };
  }
  const days = (Date.parse(published) - Date.parse(eventDate)) / 86_400_000;
  if (days < 0 || days > PUBLICATION_WINDOW_DAYS) {
    return {
      ok: false,
      detail: `date quote has no year; ${eventDate} is not within ${PUBLICATION_WINDOW_DAYS} days before the publication date ${published} (${via})`,
    };
  }
  return { ok: true, rule: `year from the publication date ${published} (${via}), ${days} day(s) after the event`, reportedDate: published };
}

/** Case-sensitive word match: lowercase, or with a capital first letter (a headline's first word). */
function verbs(words: string[]): RegExp {
  return new RegExp(`\\b(${words.map((w) => `[${w[0].toUpperCase()}${w[0]}]${w.slice(1)}`).join("|")})\\b`);
}

/**
 * Removes acronyms and treaty names (all-caps tokens such as START-3, NATO, CSTO, US), so that
 * "START" is never read as the verb "start".
 */
export function withoutAcronyms(text: string): string {
  return text.replace(/\b[A-Z][A-Z0-9]+(?:-[A-Z0-9]+)*\b/g, " ");
}

/** Onset or end wording in a headline needs matching wording in the excerpt. */
const CLAIM_CHECKS: Array<{ name: string; headline: RegExp; excerpt: RegExp }> = [
  {
    name: "a start",
    headline: verbs(["begin", "begins", "began", "begun", "start", "starts", "started", "launch", "launches", "launched", "kicks off", "kick off", "kicked off", "opens", "opened"]),
    excerpt: /\b(begin|begins|began|begun|beginning|start|starts|started|starting|launch|launches|launched|kick(s|ed)? off|open(s|ed)?)\b|начал|начина|старт|стартова|rozpocz|rozpoczę|zaczę|prasidė|pradė|sāk|algas|алп/i,
  },
  {
    name: "an end",
    headline: verbs(["end", "ends", "ended", "conclude", "concludes", "concluded", "complete", "completes", "completed", "finish", "finishes", "finished"]),
    excerpt: /\b(end|ends|ended|conclud\w*|complet\w*|finish\w*|wrap(s|ped)? up)\b|заверш|окончен|закончи|zakończ|baig|noslēdz|lõpp/i,
  },
];

/**
 * In-scope places for the historical record: Belarus, Kaliningrad, the on-map Russian oblasts
 * (Leningrad, Pskov, Novgorod, Smolensk) and St Petersburg, the Baltic states, Poland, the Baltic Sea.
 */
const REGION_WORDS =
  /(^|[^\p{L}])(belarus\w*|minsk|kaliningrad\w*|leningrad\w*|st\.? petersburg|saint petersburg|petersburg|pskov\w*|novgorod\w*|smolensk\w*|eston\w*|latvi\w*|lithuani\w*|poland|polish|baltic\w*)(?=[^\p{L}]|$)/iu;

/** True when the model's one-line region reason names an in-scope place. */
export function regionReasonInScope(reason: string | null | undefined): boolean {
  return typeof reason === "string" && reason.trim().length > 0 && REGION_WORDS.test(reason);
}

/** Names a publisher goes by: the full name, its parenthetical part, acronyms and brand words with digits. */
function publisherNames(publisher: string): string[] {
  const outer = publisher.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const inner = [...publisher.matchAll(/\(([^)]+)\)/g)].map((m) => m[1].trim());
  const tokens = publisher.split(/[\s()]+/).filter((w) => /^\p{Lu}{2,}$/u.test(w) || /\p{L}\d|\d\p{L}/u.test(w));
  return [...new Set([outer, ...inner, ...tokens].filter((n) => n.length >= 2))];
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * The attribution found in a headline, or null: any "per …" / "according to …", or the
 * publisher named as the teller ("reported by OSW", "OSW reports", "OSW says", "OSW analysis",
 * "OSW: …"). A place name inside a publisher's name (Belarus Ministry of Defence) does not count.
 */
export function headlineNamesSource(headline: string, publisher: string): string | null {
  const generic = headline.match(/(^|[^\p{L}])(per|according to)\s+\S+/iu);
  if (generic) return generic[0].trim();
  for (const name of publisherNames(publisher)) {
    const n = escapeRe(name);
    const told = new RegExp(
      `(^|[^\\p{L}])(reported by|by)\\s+(the\\s+)?${n}(?=[^\\p{L}]|$)|(^|[^\\p{L}])${n}\\s+(reports?|reported|says|said|analysis|notes)(?=[^\\p{L}]|$)|^\\s*${n}\\s*:`,
      "iu",
    );
    const m = headline.match(told);
    if (m) return m[0].trim();
  }
  return null;
}

/** The first thing the headline claims that the excerpt does not, or null. Acronyms are ignored on both sides. */
export function headlineOverclaim(headline: string, excerpt: string): string | null {
  const h = withoutAcronyms(headline);
  const e = withoutAcronyms(excerpt);
  for (const check of CLAIM_CHECKS) {
    if (check.headline.test(h) && !check.excerpt.test(e)) {
      return `headline states ${check.name} ("${h.match(check.headline)![0]}"); the excerpt does not`;
    }
  }
  return null;
}

/** The page's own publication date, from common metadata, or null. */
export function publishedDateFromHtml(html: string): string | null {
  const patterns = [
    /<meta[^>]+(?:property|name|itemprop)=["'](?:article:published_time|datePublished|date|pubdate|publish-date|dc\.date)["'][^>]*content=["'](\d{4}-\d{2}-\d{2})/i,
    /<meta[^>]+content=["'](\d{4}-\d{2}-\d{2})[^"']*["'][^>]*(?:property|name|itemprop)=["'](?:article:published_time|datePublished|date)["']/i,
    /"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})/i,
    /<time[^>]+datetime=["'](\d{4}-\d{2}-\d{2})/i,
  ];
  for (const re of patterns) {
    const match = html.match(re);
    if (match) return match[1];
  }
  return null;
}

const PRONOUN_START =/^(he|she|they|it|his|her|their|its|this|these|those|we|him|them)\b/i;

/**
 * When the excerpt starts with a pronoun, the sentence just before it on the page (so a reviewer
 * can see who "he" is); otherwise null. Null too when the excerpt can't be located.
 */
export function sentenceBefore(text: string, excerpt: string): string | null {
  const quote = excerpt.trim();
  if (!PRONOUN_START.test(quote)) return null;
  const words = quote.split(/\s+/).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const at = text.search(new RegExp(words.join("\\s+"), "i"));
  if (at < 0) return null;
  const sentences = text.slice(0, at).match(/[^.!?]+[.!?]+["'”’)]*\s*/g);
  return sentences?.at(-1)?.trim() ?? (text.slice(0, at).trim() || null);
}

export type Verified = {
  ok: true;
  candidate: HistoricalCandidate;
  /** Which rule supplied the year, for the reviewer. */
  dateRule: string;
  /** The page's publication date, when known (stored as reported_date). */
  reportedDate: string | null;
  flags: string[];
};
export type Dropped = { ok: false; reason: DropReason; detail: string };

/** The date rule alone, for diagnostics: the quote must be on the page, short, and state the date. */
export function checkDate(c: HistoricalCandidate, page: { html: string; text: string }): DateResolution {
  const dateQuote = (c.date_excerpt ?? "").trim();
  const dateWords = dateQuote ? dateQuote.split(/\s+/).length : 0;
  if (!dateQuote || !normalize(page.text).includes(normalize(dateQuote))) {
    return { ok: false, detail: "date quote not found on the page" };
  }
  if (dateWords > MAX_EXCERPT_WORDS) return { ok: false, detail: `date quote has ${dateWords} words` };
  return resolveDate(dateQuote, c.event_date, page);
}

/** Checks one candidate against the fetched page. `month` is the requested YYYY-MM, or a YYYY-MM:YYYY-MM range. */
export function verifyCandidate(
  c: HistoricalCandidate,
  page: { html: string; text: string },
  month: string,
): Verified | Dropped {
  if (!EVENT_TYPE_VALUES.includes(c.event_type as EventType)) {
    return { ok: false, reason: "invalid candidate", detail: `unknown event_type "${c.event_type}"` };
  }
  if (!c.excerpt_supports?.trim()) {
    return { ok: false, reason: "invalid candidate", detail: "no \"what the excerpt supports\" line" };
  }
  const [firstMonth, lastMonth = firstMonth] = month.split(":");
  const eventMonth = c.event_date.slice(0, 7);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(c.event_date) || eventMonth < firstMonth || eventMonth > lastMonth) {
    return { ok: false, reason: "date outside month", detail: `event_date ${c.event_date} is not in ${month}` };
  }

  const date = checkDate(c, page);
  if (!date.ok) {
    return { ok: false, reason: /words$/.test(date.detail) ? "excerpt too long" : "no stated date", detail: date.detail };
  }

  const wording = `${c.headline}\n${c.summary}\n${c.excerpt_supports}`;
  const phrase = findBannedPhrase(wording);
  if (phrase) return { ok: false, reason: "banned phrase", detail: `"${phrase}"` };

  // The extractor's own checks: excerpt verbatim and short, valid date not after publication,
  // predictive wording, coordinates, verification commentary.
  const outcome = validateEvent(
    {
      event_date: c.event_date,
      date_certainty: "EXACT",
      date_note: null,
      headline: c.headline,
      summary: c.summary,
      actor: c.actor,
      country: c.country,
      location_name: c.location_name,
      location_generalized: false,
      event_type: c.event_type as EventType,
      claim_by: c.claim_by,
      exercise_name: c.exercise_name,
      announced_start_date: null,
      announced_end_date: null,
      supporting_excerpt: c.supporting_excerpt,
    },
    { title: null, text: page.text, publishedAt: new Date(`${date.reportedDate ?? c.event_date}T00:00:00Z`) },
  );
  if (!outcome.ok) {
    const reason: DropReason = /not found verbatim/.test(outcome.reason)
      ? "excerpt not found"
      : /words \(max/.test(outcome.reason) || /empty excerpt/.test(outcome.reason)
        ? "excerpt too long"
        : /predictive/.test(outcome.reason)
          ? "banned phrase"
          : /after the published date/.test(outcome.reason)
            ? "no stated date"
            : "invalid candidate";
    return { ok: false, reason, detail: outcome.reason };
  }

  if (!regionReasonInScope(c.region_reason)) {
    return {
      ok: false,
      reason: "outside region",
      detail: c.region_reason?.trim() ? `region reason names no in-scope place: "${c.region_reason}"` : "no region reason",
    };
  }
  const named = headlineNamesSource(c.headline, c.publisher);
  if (named) return { ok: false, reason: "headline names the source", detail: `headline contains "${named}"` };

  const overclaim = headlineOverclaim(c.headline, c.supporting_excerpt);
  if (overclaim) return { ok: false, reason: "headline claims more than excerpt", detail: overclaim };

  const pageNorm = normalize(page.text);
  if (c.actor && !pageNorm.includes(normalize(c.actor))) {
    return { ok: false, reason: "actor not on page", detail: `actor "${c.actor}" is not on the page as written` };
  }

  // Details the page does not state: flagged for the reviewer, not dropped.
  const flags = [...outcome.value.flags];
  for (const [label, value] of [
    ["location", c.location_name],
    ["claim_by", c.claim_by],
    ["exercise", c.exercise_name],
  ] as const) {
    if (value && !pageNorm.includes(normalize(value))) flags.push(`${label} "${value}" is not on the page as written.`);
  }
  const numbers = new Set(`${c.headline}\n${c.summary}`.match(/\b\d[\d,.]*\b/g) ?? []);
  for (const n of numbers) {
    const bare = n.replace(/[,.]$/, "");
    if (!page.text.includes(bare)) flags.push(`number "${bare}" in the headline or summary is not on the page.`);
  }
  return {
    ok: true,
    candidate: { ...c, summary: outcome.value.event.summary },
    dateRule: date.rule,
    reportedDate: date.reportedDate,
    flags,
  };
}

export type ParsedReply = {
  candidates: HistoricalCandidate[];
  /** Why fewer candidates than requested came back, in the model's words. */
  shortfallReason: string | null;
  /** Any text outside the JSON block. */
  otherText: string;
  /** URL mode: the page this reply was about. */
  source?: string;
};

/** Pulls {"candidates": [...], "shortfall_reason": "..."} out of the model's final text. */
export function parseReply(text: string): ParsedReply | null {
  const fenced = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/g)];
  const bodies = fenced.length
    ? fenced.reverse().map((m) => ({ body: m[1], raw: m[0] }))
    : [{ body: text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1), raw: text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1) }];
  for (const { body, raw } of bodies) {
    try {
      const parsed = JSON.parse(body) as { candidates?: unknown; shortfall_reason?: unknown };
      if (!Array.isArray(parsed.candidates)) continue;
      return {
        candidates: parsed.candidates.filter(
          (c): c is HistoricalCandidate =>
            typeof c === "object" && c !== null &&
            ["url", "publisher", "event_date", "date_excerpt", "headline", "summary", "event_type", "supporting_excerpt"].every(
              (k) => typeof (c as Record<string, unknown>)[k] === "string",
            ),
        ),
        shortfallReason: typeof parsed.shortfall_reason === "string" && parsed.shortfall_reason.trim() ? parsed.shortfall_reason.trim() : null,
        otherText: raw ? text.replace(raw, "").trim() : "",
      };
    } catch {
      // try the next block
    }
  }
  return null;
}
