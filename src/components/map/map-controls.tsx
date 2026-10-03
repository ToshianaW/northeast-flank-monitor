import Link from "next/link";
import { MAP_LAYERS, MAP_WINDOWS, type MapLayer, type MapWindow } from "@/lib/map-data";
import { LAYER_LABELS } from "@/lib/map-style";

function href(layer: MapLayer, days: MapWindow): string {
  return `/map?layer=${layer}&days=${days}`;
}

function Segment({
  label,
  options,
}: {
  label: string;
  options: { key: string; text: string; href: string; active: boolean }[];
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap items-center gap-2">
      <span className="meta-label mr-1">{label}</span>
      <div className="inline-flex flex-wrap rounded-full border border-border bg-surface-dark p-1">
        {options.map((o) => (
          <Link
            key={o.key}
            href={o.href}
            scroll={false}
            aria-current={o.active ? "true" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              o.active
                ? "bg-teal-blue text-white"
                : "text-text-secondary hover:text-foreground"
            }`}
          >
            {o.text}
          </Link>
        ))}
      </div>
    </div>
  );
}

/** Layer and window live in the URL, so the server renders counts and the table without JS. */
export function MapControls({ layer, days }: { layer: MapLayer; days: MapWindow }) {
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-3">
      <Segment
        label="Layer"
        options={MAP_LAYERS.map((l) => ({
          key: l,
          text: LAYER_LABELS[l],
          href: href(l, days),
          active: l === layer,
        }))}
      />
      <Segment
        label="Window"
        options={MAP_WINDOWS.map((d) => ({
          key: String(d),
          text: `${d} days`,
          href: href(layer, d),
          active: d === days,
        }))}
      />
    </div>
  );
}
