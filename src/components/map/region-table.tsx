import type { MapData } from "@/lib/map-data";
import { LAYER_LABELS, legendTitle } from "@/lib/map-style";
import { MapItemList } from "./map-item-list";

/**
 * Non-visual alternative to the map: every area's count for the selected layer, with its
 * regions that have any, then the items that concern the whole theater or have no place.
 */
export function RegionTable({ data }: { data: MapData }) {
  const theaterWide = data.items.filter((i) => i.placement.kind === "theater-wide");
  const unplaced = data.items.filter((i) => i.placement.kind === "unplaced");

  return (
    <div className="grid gap-6">
      <section aria-labelledby="region-counts-heading" className="panel">
        <h2 id="region-counts-heading" className="text-base font-semibold">
          Counts by area
        </h2>
        <p className="mt-1 text-xs text-text-secondary">
          {legendTitle(data.days)} · Layer: {LAYER_LABELS[data.layer]}. An area&apos;s count
          includes its regions and items that concern the area as a whole.
        </p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <caption className="sr-only">
              {legendTitle(data.days)}, {LAYER_LABELS[data.layer]} layer, by area and region
            </caption>
            <thead>
              <tr className="border-b border-border text-left text-xs text-text-secondary">
                <th scope="col" className="py-2 pr-4 font-medium">Area or region</th>
                <th scope="col" className="py-2 text-right font-medium">Published</th>
              </tr>
            </thead>
            <tbody>
              {data.units.map((u) => (
                <UnitRows key={u.id} unit={u} />
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="theater-wide-heading" className="panel">
        <h2 id="theater-wide-heading" className="text-base font-semibold">
          Theater-wide
        </h2>
        <p className="mt-1 mb-4 text-xs text-text-secondary">
          Concern the whole flank rather than one area, so they are not shaded. All layers.
        </p>
        <MapItemList items={theaterWide} empty="None in this window." />
      </section>

      <section aria-labelledby="unplaced-heading" className="panel">
        <h2 id="unplaced-heading" className="text-base font-semibold">
          Unplaced events
        </h2>
        <p className="mt-1 mb-4 text-xs text-text-secondary">
          No place in the map&apos;s gazetteer, or a place outside the theater. All layers.
        </p>
        <MapItemList items={unplaced} empty="None in this window." />
      </section>
    </div>
  );
}

function UnitRows({ unit }: { unit: MapData["units"][number] }) {
  const regions = unit.regions.length > 1 ? unit.regions.filter((r) => r.count > 0) : [];
  return (
    <>
      <tr className="border-b border-border">
        <th scope="row" className="py-2 pr-4 text-left font-medium">{unit.name}</th>
        <td className="py-2 text-right font-mono tabular-nums">{unit.count}</td>
      </tr>
      {regions.map((r) => (
        <tr key={r.id} className="border-b border-border text-text-secondary">
          <th scope="row" className="py-1.5 pr-4 pl-5 text-left font-normal">{r.name}</th>
          <td className="py-1.5 text-right font-mono tabular-nums">{r.count}</td>
        </tr>
      ))}
    </>
  );
}
