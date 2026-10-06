/**
 * Type, country and text filters for the Latest page. Pure. Options come from the events in the
 * window (with counts); a type or country that is not an option is ignored.
 */
import { EVENT_TYPE_LABELS, type EventType } from "@/lib/event-labels";

export type LatestFilters = { type: EventType | null; country: string | null; q: string };

type FilterableEvent = {
  event_type: EventType;
  country: string | null;
  headline: string;
  summary: string | null;
  location_name: string | null;
  actor: string | null;
};
type Params = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() ?? "";
/** Lower case without diacritics, so "lodz" finds "Łódź" and "baltkrievija" finds "Baltkrievija". */
const fold = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "").replace(/ł/g, "l").replace(/Ł/g, "L").toLowerCase();

export type LatestOption = { value: string; label: string; count: number };

/** Types and countries present among the events, most frequent first. */
export function latestFilterOptions(events: readonly FilterableEvent[]): { types: LatestOption[]; countries: LatestOption[] } {
  const count = <K extends string>(keys: K[]) => {
    const m = new Map<K, number>();
    for (const k of keys) m.set(k, (m.get(k) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  };
  return {
    types: count(events.map((e) => e.event_type)).map(([value, n]) => ({ value, label: EVENT_TYPE_LABELS[value], count: n })),
    countries: count(events.map((e) => e.country?.trim()).filter((c): c is string => !!c)).map(([value, n]) => ({
      value,
      label: value,
      count: n,
    })),
  };
}

/** ?type=…&country=…&q=…; type and country only when they are options, q at most 100 characters. */
export function parseLatestFilters(
  params: Params,
  options: { types: readonly LatestOption[]; countries: readonly LatestOption[] },
): LatestFilters {
  const type = first(params.type);
  const country = first(params.country);
  return {
    type: (options.types.find((t) => t.value === type)?.value as EventType | undefined) ?? null,
    country: options.countries.find((c) => c.value.toLowerCase() === country.toLowerCase())?.value ?? null,
    q: first(params.q).replace(/\s+/g, " ").slice(0, 100),
  };
}

/** Every word of q must appear in the headline, summary, place or actor (any order, any case). */
export function matchesLatest(event: FilterableEvent, filters: LatestFilters): boolean {
  if (filters.type && event.event_type !== filters.type) return false;
  if (filters.country && event.country?.trim().toLowerCase() !== filters.country.toLowerCase()) return false;
  if (filters.q) {
    const haystack = fold([event.headline, event.summary, event.location_name, event.actor, event.country].filter(Boolean).join(" "));
    if (!fold(filters.q).split(" ").every((word) => haystack.includes(word))) return false;
  }
  return true;
}

export function hasLatestFilters(filters: LatestFilters): boolean {
  return filters.type !== null || filters.country !== null || filters.q !== "";
}
