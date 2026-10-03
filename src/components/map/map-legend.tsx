import type { MapLayer, MapWindow } from "@/lib/map-data";
import {
  DOT_NOTE,
  DOT_RADIUS,
  heatColor,
  LAYER_LABELS,
  legendTitle,
  REPORTING_NOTE,
  STEP_LABELS,
} from "@/lib/map-style";

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
      <ul className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Dot sizes">
        {[1, 2, 3].map((step) => (
          <li key={step} className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span aria-hidden className="inline-flex size-6 items-center justify-center">
              <span
                className="rounded-full"
                style={{
                  width: DOT_RADIUS[step] * 2,
                  height: DOT_RADIUS[step] * 2,
                  backgroundColor: heatColor(step),
                  boxShadow: `0 0 ${DOT_RADIUS[step] * 1.6}px ${heatColor(step)}`,
                }}
              />
            </span>
            {STEP_LABELS[step]}
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-text-secondary">{DOT_NOTE}</p>
      <p className="mt-0.5 text-xs text-text-muted">{REPORTING_NOTE}</p>
    </div>
  );
}
