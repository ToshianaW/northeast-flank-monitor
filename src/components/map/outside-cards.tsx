import type { MapData } from "@/lib/map-data";
import { CountChip } from "./count-chip";

/**
 * "Outside the theater": items that concern Russia beyond the five on-map regions, Ukraine,
 * Western Europe (incl. EU/NATO institutions) or North America. Same layer and window as
 * the map; no dots or anchors. Clicking opens the same side panel as a map area.
 */
export function OutsideCards({
  units,
  selected,
  onChoose,
}: {
  units: MapData["units"];
  selected: string | null;
  onChoose: (id: string, trigger: HTMLElement) => void;
}) {
  return (
    <section aria-labelledby="outside-heading" className="mt-6">
      <h2 id="outside-heading" className="meta-label mb-2">
        Outside the theater
      </h2>
      <ul className="-mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-2 sm:grid sm:grid-cols-2 sm:overflow-visible xl:grid-cols-4">
        {units.map((u) => (
          <li key={u.id} className="min-w-[13rem] snap-start sm:min-w-0">
            <button
              type="button"
              aria-pressed={selected === u.id}
              onClick={(e) => onChoose(u.id, e.currentTarget)}
              className={`panel flex h-full w-full flex-col items-start gap-2 !p-4 text-left transition-colors ${
                selected === u.id ? "border-foam" : "hover:border-foam"
              }`}
            >
              <span className="text-sm font-medium leading-snug text-foreground">{u.name}</span>
              <CountChip count={u.count} step={u.step} />
              {u.count === 0 ? (
                <span className="text-xs text-text-muted">No published items in this window</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
