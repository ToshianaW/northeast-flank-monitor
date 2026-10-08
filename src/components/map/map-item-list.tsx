"use client";

import Link from "next/link";
import { useState } from "react";
import { formatEventDate } from "@/components/event-log-entry";
import { CONFIDENCE_LEVEL_LABELS, EVENT_TYPE_LABELS } from "@/lib/event-labels";
import { CONFIDENCE_TONES, eventTypeTone } from "@/lib/event-tones";
import type { MapItem } from "@/lib/map-data";

/** Items shown at a time in the map's side panel. */
export const MAP_LIST_PAGE_SIZE = 4;

/**
 * Published events and exercises for a map area, newest first, 4 at a time with Previous and
 * Next (no page load). Give it a `key` per selection so a new area starts at the first page.
 */
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
  const [page, setPage] = useState(0);
  if (items.length === 0) return <p className="text-sm text-text-secondary">{empty}</p>;

  const sorted = [...items].sort((a, b) => b.date.localeCompare(a.date));
  const pageCount = Math.ceil(sorted.length / MAP_LIST_PAGE_SIZE);
  const current = Math.min(page, pageCount - 1);
  const start = current * MAP_LIST_PAGE_SIZE;
  const shown = sorted.slice(start, start + MAP_LIST_PAGE_SIZE);

  return (
    <div>
      <ul className="divide-y divide-border">
        {shown.map((item) => {
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
      {pageCount > 1 ? (
        <nav aria-label="More items" className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-3">
          <button
            type="button"
            onClick={() => setPage(current - 1)}
            disabled={current === 0}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            ← Previous
          </button>
          <p className="font-mono text-xs text-text-muted" aria-live="polite">
            {start + 1}–{start + shown.length} of {sorted.length}
          </p>
          <button
            type="button"
            onClick={() => setPage(current + 1)}
            disabled={current === pageCount - 1}
            className="rounded-full border border-border px-3 py-1.5 text-sm text-text-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          >
            Next →
          </button>
        </nav>
      ) : null}
    </div>
  );
}
