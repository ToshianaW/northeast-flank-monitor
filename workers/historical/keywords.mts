/**
 * Title prefilter for archive listings: military-activity keywords in English, Polish, Lithuanian
 * and Estonian (word starts, case-insensitive). A title that matches is worth a URL-mode run;
 * one that doesn't is skipped before any model call.
 */
const STEMS: Record<string, string[]> = {
  en: ["exercis", "drill", "troop", "deploy", "zapad", "border", "air defen", "missile", "naval\\b", "navy\\b", "readiness", "mobilis", "mobiliz"],
  pl: ["ćwicze", "ćwiczeni", "wojsk", "żołnierz", "rozmieszcz", "granic", "obrona powietrzn", "obrony powietrzn", "rakiet", "pocisk", "marynark", "morsk", "gotowoś", "mobilizac"],
  lt: ["pratyb", "kari", "kariuomen", "dislok", "sien", "oro gynyb", "raket", "laivyn", "jūr", "parengt", "mobilizac"],
  et: ["õppus", "vägi", "väed", "vägede", "paigut", "piiri", "õhutõrj", "rakett", "mereväe", "merevägi", "valmidus", "mobilisats"],
};

const PATTERN = new RegExp(`(^|[^\\p{L}])(${Object.values(STEMS).flat().join("|")})`, "iu");

export function matchesMilitaryKeywords(title: string): boolean {
  return PATTERN.test(title);
}

/** Wider filter for OSW analysis and commentary titles, which rarely name the activity itself. */
const OSW_INCLUDE = [
  "belarus", "russia", "army", "armies", "armed forces", "troop", "zapad", "nato", "baltic", "kaliningrad",
  "poland", "polish", "lithuania", "latvia", "estonia", "military", "militar", "defence", "defense",
  "exercis", "drill", "border", "frontier", "deploy", "missile", "air defen", "naval\\b", "navy\\b", "mobilis", "mobiliz",
];
const OSW_EXCLUDE = [
  "energy", "gas\\b", "oil\\b", "nord stream", "lng\\b", "nuclear power", "electricity", "covid", "pandemic", "vaccin",
  "coronavirus", "navalny", "econom", "budget", "inflation", "bank", "trade\\b", "tax\\b", "pension",
  "demograph", "church", "elections? to", "court", "protest",
];
const OSW_INCLUDE_RE = new RegExp(`(^|[^\\p{L}])(${OSW_INCLUDE.join("|")})`, "iu");
const OSW_EXCLUDE_RE = new RegExp(`(^|[^\\p{L}])(${OSW_EXCLUDE.join("|")})`, "iu");

/** URL-slug keywords for NATO news articles (slugs use hyphens between words); matched at word starts. */
const NATO_SLUG_WORDS = [
  "exercis", "forward-presence", "battlegroup", "battle-group", "air-policing",
  "baltic", "belarus", "zapad", "readiness", "deploy",
  "lithuania", "latvia", "estonia", "poland", "polish", "kaliningrad", "russia",
];
const NATO_SLUG_RE = new RegExp(`(^|-)(${NATO_SLUG_WORDS.join("|")})`, "i");

export function matchesNatoSlug(slug: string): boolean {
  return NATO_SLUG_RE.test(slug);
}

/** The compiled patterns, exported so a test can check their escapes survived editing. */
export const KEYWORD_PATTERNS = { military: PATTERN, oswInclude: OSW_INCLUDE_RE, oswExclude: OSW_EXCLUDE_RE };

export function matchesOswContext(title: string): boolean {
  return OSW_INCLUDE_RE.test(title) && !OSW_EXCLUDE_RE.test(title);
}
