import type { MapLayer, MapWindow } from "@/lib/map-data";
import { LAYER_LABELS, legendTitle, REPORTING_NOTE, SHADE_COLORS, SHADE_LABELS } from "@/lib/map-style";

const LAYER_SCOPE: Record<MapLayer, string> = {
  activity: "exercises, movements, air, naval, border incidents, deployments and other activity",
  statements: "political signaling and official warnings",
  all: "activity and statements",
};

export function MapLegend({
  layer,
  days,
  compact = false,
}: {
  layer: MapLayer;
  days: MapWindow;
  compact?: boolean;
}) {
  return (
    <div className="text-sm">
      <p className="font-medium text-foreground">{legendTitle(days)}</p>
      <p className="mt-0.5 text-xs text-text-secondary">
        Layer shown: <span className="text-foreground">{LAYER_LABELS[layer]}</span>
        {compact ? null : <> ({LAYER_SCOPE[layer]})</>}
      </p>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1" aria-label="Shading steps">
        {SHADE_LABELS.map((label, i) => (
          <li key={label} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span
              aria-hidden
              className="inline-block size-3.5 rounded-sm border border-border"
              style={{ backgroundColor: SHADE_COLORS[i] }}
            />
            {label}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-muted">{REPORTING_NOTE}</p>
    </div>
  );
}
