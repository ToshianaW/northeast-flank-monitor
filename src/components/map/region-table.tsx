import Link from "next/link";
import type { MapData } from "@/lib/map-data";
import { LAYER_LABELS, legendTitle } from "@/lib/map-style";

/**
 * Non-visual alternative to the map: every area's count for the selected layer (with its
 * regions that have any), Theater-wide, the "Outside the theater" cards, then a collapsed
 * list of items whose place can't be determined.
 */
export function RegionTable({ data }: { data: MapData }) {
  const unclear = data.items.filter((i) => i.placement.kind === "unplaced");
  const onMap = data.units.filter((u) => u.onMap);
  const outside = data.units.filter((u) => !u.onMap);

  return (
    <section aria-labelledby="region-counts-heading" className="panel">
      <h2 id="region-counts-heading" className="text-base font-semibold">
        Counts by area
      </h2>
      <p className="mt-1 text-xs text-text-secondary">
        {legendTitle(data.days)} · Layer: {LAYER_LABELS[data.layer]}. An area&apos;s count includes
        its regions and items that concern the area as a whole.
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
            {onMap.map((u) => (
              <UnitRows key={u.id} unit={u} />
            ))}
            <Row name="Theater-wide" count={data.theaterWide.count} />
            <tr>
              <th scope="rowgroup" colSpan={2} className="pt-4 pb-1 text-left text-xs font-medium text-text-secondary">
                Outside the theater
              </th>
            </tr>
            {outside.map((u) => (
              <Row key={u.id} name={u.name} count={u.count} />
            ))}
          </tbody>
        </table>
      </div>

      <details className="mt-4 text-xs text-text-secondary">
        <summary className="cursor-pointer">
          Location unclear: {unclear.length === 1 ? "1 item" : `${unclear.length} items`} (all layers)
        </summary>
        {unclear.length === 0 ? (
          <p className="mt-2">None in this window.</p>
        ) : (
          <ul className="mt-2 grid gap-1">
            {unclear.map((i) => (
              <li key={`${i.kind}-${i.id}`}>
                <Link href={i.href} className="link">
                  {i.headline}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </details>
    </section>
  );
}

function Row({ name, count, sub = false }: { name: string; count: number; sub?: boolean }) {
  return (
    <tr className={`border-b border-border ${sub ? "text-text-secondary" : ""}`}>
      <th scope="row" className={`text-left ${sub ? "py-1.5 pr-4 pl-5 font-normal" : "py-2 pr-4 font-medium"}`}>
        {name}
      </th>
      <td className="py-1.5 text-right font-mono tabular-nums">{count}</td>
    </tr>
  );
}

function UnitRows({ unit }: { unit: MapData["units"][number] }) {
  const regions = unit.regions.length > 1 ? unit.regions.filter((r) => r.count > 0) : [];
  return (
    <>
      <Row name={unit.name} count={unit.count} />
      {regions.map((r) => (
        <Row key={r.id} name={r.name} count={r.count} sub />
      ))}
    </>
  );
}
