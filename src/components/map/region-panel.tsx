import type { Ref } from "react";
import type { MapData, MapItem } from "@/lib/map-data";
import { THEATER_WIDE_ID } from "@/lib/map-style";
import { MapItemList } from "./map-item-list";

/** A map area, one of its regions, an "Outside the theater" card, or Theater-wide. */
export type MapSelection = { unit: string; region: string | null } | null;

const COUNTRY_UNITS = new Set(["PL", "LT", "LV", "EE", "BY"]);

/** Side panel for a selection: both layers, statements labelled, newest first. */
export function RegionPanel({
  data,
  selection,
  headingRef,
  onSelect,
}: {
  data: MapData;
  selection: NonNullable<MapSelection>;
  headingRef: Ref<HTMLHeadingElement>;
  onSelect: (selection: MapSelection) => void;
}) {
  if (selection.unit === THEATER_WIDE_ID) {
    const items = data.items.filter((i) => i.placement.kind === "theater-wide");
    return (
      <Shell headingRef={headingRef} title="Theater-wide" days={data.days} count={items.length}
        note="Items about the whole flank rather than one area. Not drawn on the map.">
        <MapItemList key={THEATER_WIDE_ID} items={items} />
      </Shell>
    );
  }

  const unit =data.units.find((u) => u.id === selection.unit)!;
  const multiRegion = unit.regions.length > 1;
  const region = selection.region ? unit.regions.find((r) => r.id === selection.region) : undefined;
  const inUnit = data.items.filter((i) => i.placement.kind === "placed" && i.placement.unit === unit.id);
  const regionOf = (i: MapItem) => (i.placement.kind === "placed" ? i.placement.region : null);

  if (region && multiRegion) {
    const items = inUnit.filter((i) => regionOf(i) === region.id);
    const wideCount = inUnit.filter((i) => regionOf(i) === null).length;
    return (
      <Shell headingRef={headingRef} eyebrow={unit.name} title={region.name} days={data.days} count={items.length}>
        <button
          type="button"
          onClick={() => onSelect({ unit: unit.id, region: null })}
          className="mb-4 rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-foreground"
        >
          All of {unit.name}
        </button>
        {wideCount > 0 ? (
          <p className="mb-3 text-xs text-text-muted">
            {wideCount === 1 ? "1 item concerns" : `${wideCount} items concern`} {unit.name} as a whole
            and {wideCount === 1 ? "is" : "are"} listed under All of {unit.name}.
          </p>
        ) : null}
        <MapItemList key={region.id} items={items} />
      </Shell>
    );
  }

  // One list, newest first: each item says its region, or that it concerns the whole area.
  const wideLabel = COUNTRY_UNITS.has(unit.id) ? "Country-wide" : `${unit.name}, no specific region`;
  const areaLabel = (i: MapItem) =>
    unit.regions.find((r) => r.id === regionOf(i))?.name ?? wideLabel;
  return (
    <Shell
      headingRef={headingRef}
      eyebrow={unit.onMap ? undefined : "Outside the theater"}
      title={unit.name}
      days={data.days}
      count={inUnit.length}
    >
      <MapItemList
        key={unit.id}
        items={inUnit}
        areaLabel={multiRegion ? areaLabel : undefined}
        empty="No published items in this window."
      />
    </Shell>
  );
}

/**
 * Overview (nothing selected): every item in the window, newest first, 4 at a time, each with
 * where it is. Selecting an area narrows it.
 */
export function OverviewPanel({ data }: { data: MapData }) {
  const where = (i: MapItem): string => {
    if (i.placement.kind === "theater-wide") return "Theater-wide";
    if (i.placement.kind === "unplaced") return "Location unclear";
    const { unit: unitId, region: regionId } = i.placement;
    const unit = data.units.find((u) => u.id === unitId);
    const region = regionId ? unit?.regions.find((r) => r.id === regionId) : undefined;
    return region && unit && unit.regions.length > 1 ? `${unit.name} · ${region.name}` : (unit?.name ?? unitId);
  };
  return (
    <Shell
      title="All activity"
      days={data.days}
      count={data.items.length}
      note="Select a dot, an area on the map, or a button or card below the map to narrow the list."
      escapeCloses={false}
    >
      <MapItemList key="overview" items={data.items} areaLabel={where} />
    </Shell>
  );
}

function Shell({
  headingRef,
  eyebrow,
  title,
  days,
  count,
  note,
  escapeCloses = true,
  children,
}: {
  headingRef?: Ref<HTMLHeadingElement>;
  eyebrow?: string;
  title: string;
  days: number;
  count: number;
  note?: string;
  /** False for the overview, which has nothing to close. */
  escapeCloses?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section aria-labelledby="region-panel-heading" className="panel">
      {eyebrow ? <p className="meta-label mb-1">{eyebrow}</p> : null}
      <h2
        id="region-panel-heading"
        ref={headingRef}
        tabIndex={-1}
        className="text-lg font-semibold leading-snug outline-none"
      >
        {title}
      </h2>
      <p className="mt-1 mb-4 text-xs text-text-secondary">
        {count === 1 ? "1 published item" : `${count} published items`} in the last {days} days, all
        layers.{escapeCloses ? " Escape closes." : null}
        {note ? <> {note}</> : null}
      </p>
      {children}
    </section>
  );
}
