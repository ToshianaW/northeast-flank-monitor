/**
 * Country and month filters for the Air Activity and Exercises pages and the admin lists, and
 * the admin lists' pages of 20. Pure. The options come from the items on the page; a value that
 * is not an option is ignored (shows everything).
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

/** Rows per page on the admin lists (events, exercises, digests). */
export const ADMIN_PAGE_SIZE = 20;

export type Page<T> = {
  items: T[];
  /** 1-based, clamped to the pages that exist. */
  page: number;
  pageCount: number;
  total: number;
  /** 1-based positions of the first and last item shown; 0 when there are none. */
  from: number;
  to: number;
};

/** ?page=N, clamped to 1…pageCount; anything else is page 1. */
export function paginate<T>(items: readonly T[], pageParam: string | string[] | undefined, size = ADMIN_PAGE_SIZE): Page<T> {
  const pageCount = Math.max(1, Math.ceil(items.length / size));
  const requested = Number.parseInt(first(pageParam), 10);
  const page = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), pageCount) : 1;
  const start = (page - 1) * size;
  const shown = items.slice(start, start + size);
  return {
    items: shown,
    page,
    pageCount,
    total: items.length,
    from: shown.length > 0 ? start + 1 : 0,
    to: start + shown.length,
  };
}

/** The list URL with the current filters and a page (page 1 is left out). */
export function listHref(base: string, filters: ListFilters, page = 1): string {
  const params = new URLSearchParams();
  if (filters.country) params.set("country", filters.country);
  if (filters.month) params.set("month", filters.month);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `${base}?${query}` : base;
}

export function matchesFilters(item: { countries: readonly string[]; month: string | null }, filters: ListFilters): boolean {
  if (filters.country && !item.countries.some((c) => c.trim().toLowerCase() === filters.country!.toLowerCase())) return false;
  if (filters.month && item.month !== filters.month) return false;
  return true;
}
