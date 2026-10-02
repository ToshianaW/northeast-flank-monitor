import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  CONFIDENCE_LEVEL_LABELS,
  CONFIDENCE_LEVEL_VALUES,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VALUES,
} from "@/lib/event-labels";
import type { ArchiveFilters as Filters } from "@/lib/public-events";
import { SOURCE_TYPE_LABELS, SOURCE_TYPE_VALUES } from "@/lib/source-labels";

type Option = { value: string; label: string };

function SelectField({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: Option[];
}) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={`f-${name}`} className="meta-label">
        {label}
      </Label>
      <NativeSelect id={`f-${name}`} name={name} defaultValue={value ?? ""} className="w-full">
        <NativeSelectOption value="">All</NativeSelectOption>
        {options.map((o) => (
          <NativeSelectOption key={o.value} value={o.value}>
            {o.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/** Plain GET form: filters land in the query string and can be bookmarked. */
export function ArchiveFilters({
  filters,
  countries,
  actors,
}: {
  filters: Filters;
  countries: string[];
  actors: string[];
}) {
  return (
    <form
      method="get"
      action="/archive"
      className="border border-border bg-surface-dark p-4 sm:p-5"
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="grid gap-1.5">
          <Label htmlFor="f-from" className="meta-label">
            From
          </Label>
          <Input id="f-from" name="from" type="date" defaultValue={filters.from ?? ""} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="f-to" className="meta-label">
            To
          </Label>
          <Input id="f-to" name="to" type="date" defaultValue={filters.to ?? ""} />
        </div>
        <SelectField
          name="country"
          label="Country"
          value={filters.country}
          options={countries.map((c) => ({ value: c, label: c }))}
        />
        <SelectField
          name="actor"
          label="Actor"
          value={filters.actor}
          options={actors.map((a) => ({ value: a, label: a }))}
        />
        <SelectField
          name="type"
          label="Event type"
          value={filters.type}
          options={EVENT_TYPE_VALUES.map((v) => ({ value: v, label: EVENT_TYPE_LABELS[v] }))}
        />
        <SelectField
          name="confidence"
          label="Confidence"
          value={filters.confidence}
          options={CONFIDENCE_LEVEL_VALUES.map((v) => ({
            value: v,
            label: CONFIDENCE_LEVEL_LABELS[v],
          }))}
        />
        <SelectField
          name="source_type"
          label="Source type"
          value={filters.source_type}
          options={SOURCE_TYPE_VALUES.map((v) => ({ value: v, label: SOURCE_TYPE_LABELS[v] }))}
        />
        <div className="flex items-end gap-3">
          <Button type="submit">Apply filters</Button>
          <Link
            href="/archive"
            className="pb-1.5 text-xs text-teal-blue hover:underline"
          >
            Clear filters
          </Link>
        </div>
      </div>
      <p className="mt-3 text-xs text-text-muted">
        Source type refers to each event&apos;s primary source.
      </p>
    </form>
  );
}
