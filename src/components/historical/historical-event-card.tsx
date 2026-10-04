import Link from "next/link";
import { formatEventDate } from "@/components/event-log-entry";
import { CONFIDENCE_LEVEL_LABELS, EVENT_TYPE_LABELS } from "@/lib/event-labels";
import { CONFIDENCE_TONES, eventTypeTone } from "@/lib/event-tones";
import type { PublicHistoricalEvent } from "@/lib/public-historical";

/** One published historical event, in the same card style as the current event log. */
export function HistoricalEventCard({ event }: { event: PublicHistoricalEvent }) {
  return (
    <article className="panel panel-link">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill tint ${eventTypeTone(event.event_type)}`}>{EVENT_TYPE_LABELS[event.event_type]}</span>
        <span className={`pill tint ${CONFIDENCE_TONES[event.confidence_level]}`}>
          Confidence: {CONFIDENCE_LEVEL_LABELS[event.confidence_level]}
        </span>
        {event.contradiction_flag ? <span className="pill tint tone-neutral">Conflicting reports</span> : null}
      </div>
      <h3 className="mt-3 text-base font-medium leading-snug">
        <Link
          href={`/historical/${event.event_id}`}
          className="panel-target transition-colors hover:text-link hover:underline"
        >
          {event.headline}
        </Link>
      </h3>
      <p className="mt-1 font-mono text-xs text-text-secondary">
        {formatEventDate(event.event_date)}
        {event.country ? ` · ${event.country}` : null}
        {event.source_name ? ` · Source: ${event.source_name}` : null}
      </p>
      {event.summary ? <p className="mt-2 line-clamp-2 max-w-3xl text-base text-text-secondary">{event.summary}</p> : null}
    </article>
  );
}
