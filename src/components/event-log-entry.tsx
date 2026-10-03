import Link from "next/link";
import { CONFIDENCE_LEVEL_LABELS, EVENT_TYPE_LABELS } from "@/lib/event-labels";
import { CONFIDENCE_TONES, eventTypeTone } from "@/lib/event-tones";
import type { PublicEvent } from "@/lib/public-events";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** "29 SEP 2026". Date columns use the same ISO slice as the admin pages. */
export function formatEventDate(d: Date): string {
  const [y, m, day] = d.toISOString().slice(0, 10).split("-");
  return `${day} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "11:42 UTC" */
export function formatUtcTime(d: Date): string {
  return `${d.toISOString().slice(11, 16)} UTC`;
}

/**
 * One published event. `card` is a boxed panel (Latest, Archive); `row` is an
 * unboxed feed row with a category bar, for use inside a panel (dashboard).
 */
export function EventLogEntry({
  event,
  variant = "card",
}: {
  event: PublicEvent;
  variant?: "card" | "row";
}) {
  const href = `/events/${event.event_id}`;
  const Heading = variant === "row" ? "h3" : "h2";
  const typeTone = eventTypeTone(event.event_type);

  return (
    <article
      className={
        variant === "row" ? `feed-item ${typeTone}` : "panel panel-link"
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`pill tint ${typeTone}`}>
          {EVENT_TYPE_LABELS[event.event_type]}
        </span>
        <span className={`pill tint ${CONFIDENCE_TONES[event.confidence_level]}`}>
          Confidence: {CONFIDENCE_LEVEL_LABELS[event.confidence_level]}
        </span>
        {event.contradiction_flag ? (
          <span className="pill tint tone-neutral">Conflicting reports</span>
        ) : null}
      </div>

      <Heading className="mt-3 text-base font-medium leading-snug">
        <Link
          href={href}
          className="panel-target transition-colors hover:text-link hover:underline"
        >
          {event.headline}
        </Link>
      </Heading>
      <p className="mt-1 font-mono text-xs text-text-secondary">
        {formatEventDate(event.event_date)}
        {event.first_reported ? ` · ${formatUtcTime(event.first_reported)}` : null}
        {event.country ? ` · ${event.country}` : null}
      </p>
      {event.summary ? (
        <p className="mt-2 line-clamp-2 max-w-3xl text-base text-text-secondary">
          {event.summary}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-text-secondary">
          <span className="text-text-muted">Source:</span> {event.source_name ?? "—"}
        </p>
        <Link href={href} className="btn-pill relative">
          View event →
        </Link>
      </div>
    </article>
  );
}
