import Link from "next/link";
import { formatEventDate } from "@/components/event-log-entry";
import { CONFIDENCE_LEVEL_LABELS, EVENT_TYPE_LABELS } from "@/lib/event-labels";
import { CONFIDENCE_TONES, eventTypeTone } from "@/lib/event-tones";
import type { MapItem } from "@/lib/map-data";

/** Published events and exercises for a map area, newest first. Used by the panel and the lists below the map. */
export function MapItemList({
  items,
  areaLabel,
  empty = "No published events or exercises in this window.",
}: {
  items: MapItem[];
  /** Optional per-item area name (e.g. the region inside a country). */
  areaLabel?: (item: MapItem) => string | null;
  empty?: string;
}) {
  if (items.length === 0) return <p className="text-sm text-text-secondary">{empty}</p>;
  return (
    <ul className="divide-y divide-border">
      {items.map((item) => {
        const area = areaLabel?.(item);
        return (
          <li key={`${item.kind}-${item.id}`} className="py-3 first:pt-0 last:pb-0">
            <p className="font-mono text-xs text-text-secondary">
              {formatEventDate(new Date(`${item.date}T00:00:00Z`))}
              {area ? <> · {area}</> : null}
            </p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {item.layer === "statements" ? (
                <span className="pill tint tone-foam">Statement</span>
              ) : null}
              <span className={`pill tint ${eventTypeTone(item.type)}`}>
                {item.kind === "exercise" ? "Exercise" : EVENT_TYPE_LABELS[item.type]}
              </span>
              {item.confidence ? (
                <span className={`pill tint ${CONFIDENCE_TONES[item.confidence]}`}>
                  Confidence: {CONFIDENCE_LEVEL_LABELS[item.confidence]}
                </span>
              ) : null}
            </div>
            <p className="mt-1.5 text-sm leading-snug font-medium">
              <Link href={item.href} className="link">
                {item.headline}
              </Link>
            </p>
            {item.counted ? null : (
              <p className="mt-1 text-xs text-text-muted">Counted once, with its exercise.</p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
