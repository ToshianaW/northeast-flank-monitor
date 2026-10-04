/**
 * Country and month filters for the Air Activity and Exercises pages. Pure. The options come
 * from the items on the page; a value that is not an option is ignored (shows everything).
 */

/** Items shown per group before "Show more", and how many each click adds. */
export const SHOW_STEP = 3;

export type ListFilters = { country: string | null; month: string | null };

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "2026-10" → "October 2026" */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

/** Distinct values, sorted: countries alphabetically, months newest first. */
export function filterOptions(items: ReadonlyArray<{ countries: readonly string[]; month: string | null }>) {
  const countries = [...new Set(items.flatMap((i) => i.countries.map((c) => c.trim()).filter(Boolean)))].sort((a, b) =>
    a.localeCompare(b),
  );
  const months = [...new Set(items.map((i) => i.month).filter((m): m is string => !!m))].sort().reverse();
  return { countries, months };
}

/** ?country=…&month=YYYY-MM, kept only when it is one of the options. */
export function parseListFilters(params: Params, options: { countries: readonly string[]; months: readonly string[] }): ListFilters {
  const country = first(params.country);
  const month = first(params.month);
  return {
    country: options.countries.find((c) => c.toLowerCase() === country.toLowerCase()) ?? null,
    month: options.months.includes(month) ? month : null,
  };
}

export function matchesFilters(item: { countries: readonly string[]; month: string | null }, filters: ListFilters): boolean {
  if (filters.country && !item.countries.some((c) => c.trim().toLowerCase() === filters.country!.toLowerCase())) return false;
  if (filters.month && item.month !== filters.month) return false;
  return true;
}
