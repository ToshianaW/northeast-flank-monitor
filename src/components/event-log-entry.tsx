import Link from "next/link";
import { CONFIDENCE_LEVEL_LABELS, EVENT_TYPE_LABELS } from "@/lib/event-labels";
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

export function EventLogEntry({ event }: { event: PublicEvent }) {
  const href = `/events/${event.event_id}`;

  return (
    <article className="panel panel-link">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-mono text-xs text-text-secondary">
          {formatEventDate(event.event_date)}
          {event.first_reported ? ` · ${formatUtcTime(event.first_reported)}` : null}
        </p>
        {event.country ? (
          <p className="meta-label">{event.country}</p>
        ) : null}
      </div>

      <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-link">
        {EVENT_TYPE_LABELS[event.event_type]}
      </p>
      <h2 className="mt-1 text-base font-medium leading-snug">
        <Link
          href={href}
          className="panel-target transition-colors hover:text-link hover:underline"
        >
          {event.headline}
        </Link>
      </h2>
      {event.summary ? (
        <p className="mt-1 line-clamp-2 max-w-3xl text-base text-text-secondary">
          {event.summary}
        </p>
      ) : null}

      <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-base">
        <div>
          <dt className="meta-label">Source</dt>
          <dd className="mt-0.5">{event.source_name ?? "—"}</dd>
        </div>
        <div>
          <dt className="meta-label">Confidence</dt>
          <dd className="mt-0.5">{CONFIDENCE_LEVEL_LABELS[event.confidence_level]}</dd>
        </div>
        {event.contradiction_flag ? (
          <div>
            <dt className="meta-label">Reporting</dt>
            <dd className="mt-0.5 text-text-secondary">Conflicting reports</dd>
          </div>
        ) : null}
      </dl>

      <Link
        href={href}
        className="relative mt-3 inline-block text-sm link"
      >
        View event →
      </Link>
    </article>
  );
}
