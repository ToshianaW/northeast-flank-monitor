import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { hasLatestFilters, type LatestFilters, type LatestOption } from "@/lib/latest-filters";

/** Type, country and text search for the Latest page: a plain GET form, so it works without JavaScript. */
export function LatestFilterForm({
  filters,
  types,
  countries,
}: {
  filters: LatestFilters;
  types: readonly LatestOption[];
  countries: readonly LatestOption[];
}) {
  return (
    <form method="get" action="/latest" className="panel flex max-w-4xl flex-wrap items-end gap-4 p-4" role="search">
      <div className="grid min-w-52 flex-1 gap-1">
        <label htmlFor="latest-q" className="meta-label">
          Search
        </label>
        <Input id="latest-q" name="q" type="search" defaultValue={filters.q} placeholder="e.g. drone, Narva, Hrodna" maxLength={100} />
      </div>
      <div className="grid gap-1">
        <label htmlFor="latest-type" className="meta-label">
          Type
        </label>
        <NativeSelect id="latest-type" name="type" defaultValue={filters.type ?? ""} className="min-w-48">
          <NativeSelectOption value="">All types</NativeSelectOption>
          {types.map((t) => (
            <NativeSelectOption key={t.value} value={t.value}>
              {t.label} ({t.count})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <label htmlFor="latest-country" className="meta-label">
          Country
        </label>
        <NativeSelect id="latest-country" name="country" defaultValue={filters.country ?? ""} className="min-w-44">
          <NativeSelectOption value="">All countries</NativeSelectOption>
          {countries.map((c) => (
            <NativeSelectOption key={c.value} value={c.value}>
              {c.label} ({c.count})
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit">Search</Button>
      {hasLatestFilters(filters) ? (
        <Link href="/latest" className="pb-1.5 text-sm link">
          Clear
        </Link>
      ) : null}
    </form>
  );
}
