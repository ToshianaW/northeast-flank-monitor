import Link from "next/link";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { monthLabel, type ListFilters } from "@/lib/list-filters";

/** Country and month/year filter: a plain GET form, so it works without JavaScript. */
export function ListFilterForm({
  action,
  filters,
  countries,
  months,
}: {
  action: string;
  filters: ListFilters;
  countries: readonly string[];
  months: readonly string[];
}) {
  const active = filters.country !== null || filters.month !== null;
  return (
    <form method="get" action={action} className="panel flex flex-wrap items-end gap-4 p-4">
      <div className="grid gap-1">
        <label htmlFor="filter-country" className="meta-label">
          Country
        </label>
        <NativeSelect id="filter-country" name="country" defaultValue={filters.country ?? ""} className="min-w-44">
          <NativeSelectOption value="">All countries</NativeSelectOption>
          {countries.map((c) => (
            <NativeSelectOption key={c} value={c}>
              {c}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <div className="grid gap-1">
        <label htmlFor="filter-month" className="meta-label">
          Month
        </label>
        <NativeSelect id="filter-month" name="month" defaultValue={filters.month ?? ""} className="min-w-44">
          <NativeSelectOption value="">All months</NativeSelectOption>
          {months.map((m) => (
            <NativeSelectOption key={m} value={m}>
              {monthLabel(m)}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      <Button type="submit">Search</Button>
      {active ? (
        <Link href={action} className="pb-1.5 text-sm link">
          Clear
        </Link>
      ) : null}
    </form>
  );
}
