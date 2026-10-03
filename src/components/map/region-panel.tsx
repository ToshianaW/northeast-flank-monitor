import type { Ref } from "react";
import { X } from "lucide-react";
import type { MapData, MapItem } from "@/lib/map-data";
import { MapItemList } from "./map-item-list";

export type MapSelection = { unit: string; region: string | null } | null;

const COUNTRY_UNITS = new Set(["PL", "LT", "LV", "EE", "BY"]);

/** Side panel for a selected area: both layers, statements labelled, newest first. */
export function RegionPanel({
  data,
  selection,
  headingRef,
  onSelect,
  onClose,
}: {
  data: MapData;
  selection: NonNullable<MapSelection>;
  headingRef: Ref<HTMLHeadingElement>;
  onSelect: (selection: MapSelection) => void;
  onClose: () => void;
}) {
  const unit = data.units.find((u) => u.id === selection.unit)!;
  const multiRegion = unit.regions.length > 1;
  const region = selection.region ? unit.regions.find((r) => r.id === selection.region) : undefined;
  const title = region && multiRegion ? region.name : unit.name;

  const inUnit = data.items.filter((i) => i.placement.kind === "placed" && i.placement.unit === unit.id);
  const items = region && multiRegion
    ? inUnit.filter((i) => i.placement.kind === "placed" && i.placement.region === region.id)
    : inUnit;
  const wide = COUNTRY_UNITS.has(unit.id) ? "Country-wide" : `${unit.name}, no specific region`;
  const areaLabel = (i: MapItem) =>
    !multiRegion || region || i.placement.kind !== "placed"
      ? null
      : i.placement.region
        ? (unit.regions.find((r) => r.id === (i.placement as { region: string }).region)?.name ?? null)
        : wide;
  const unitWideCount = inUnit.filter((i) => i.placement.kind === "placed" && i.placement.region === null).length;

  return (
    <section aria-labelledby="region-panel-heading" className="panel">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {region && multiRegion ? <p className="meta-label mb-1">{unit.name}</p> : null}
          <h2
            id="region-panel-heading"
            ref={headingRef}
            tabIndex={-1}
            className="text-lg font-semibold leading-snug outline-none"
          >
            {title}
          </h2>
          <p className="mt-1 text-xs text-text-secondary">
            {items.length === 1 ? "1 published item" : `${items.length} published items`} in the
            last {data.days} days, all layers
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-full p-1.5 text-text-secondary hover:text-foreground"
          aria-label="Close panel and return to overview"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onClose} className="btn-pill">
          Back to overview
        </button>
        {region && multiRegion ? (
          <button
            type="button"
            onClick={() => onSelect({ unit: unit.id, region: null })}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-foreground"
          >
            All of {unit.name}
          </button>
        ) : null}
      </div>

      {region && multiRegion && unitWideCount > 0 ? (
        <p className="mt-3 text-xs text-text-muted">
          {unitWideCount === 1 ? "1 item concerns" : `${unitWideCount} items concern`} {unit.name} as a
          whole and {unitWideCount === 1 ? "is" : "are"} listed under All of {unit.name}.
        </p>
      ) : null}

      <div className="mt-4">
        <MapItemList items={items} areaLabel={areaLabel} />
      </div>
    </section>
  );
}
