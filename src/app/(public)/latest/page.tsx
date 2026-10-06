import { pageMetadata } from "@/lib/site-metadata";
import Link from "next/link";
import { connection } from "next/server";
import { EventLogEntry } from "@/components/event-log-entry";
import { LatestFilterForm } from "@/components/latest-filter-form";
import { PageShell } from "@/components/page-shell";
import { hasLatestFilters, latestFilterOptions, matchesLatest, parseLatestFilters } from "@/lib/latest-filters";
import { LATEST_WINDOW_HOURS, listRecentPublishedEvents } from "@/lib/public-events";

export const metadata = pageMetadata("/latest", "Latest", "Published events from the last 48 hours on NATO's northeastern flank.");

export default async function LatestPage({ searchParams }: PageProps<"/latest">) {
  await connection();
  const [events, params] = await Promise.all([listRecentPublishedEvents(), searchParams]);
  const options = latestFilterOptions(events);
  const filters = parseLatestFilters(params, options);
  const filtered = hasLatestFilters(filters);
  const shown = filtered ? events.filter((e) => matchesLatest(e, filters)) : events;

  return (
    <PageShell
      eyebrow="Monitoring feed"
      title="Latest verified events"
      intro={
        <p>
          Events from the last {LATEST_WINDOW_HOURS} hours that have passed human review,
          newest first. Each entry keeps its source and confidence level. Older events are in
          the{" "}
          <Link href="/archive" className="link">
            archive
          </Link>
          .
        </p>
      }
    >
      {events.length === 0 ? (
        <div className="border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-base text-text-secondary">
            No published events in the last {LATEST_WINDOW_HOURS} hours.{" "}
            <Link href="/archive" className="link">
              Browse the archive →
            </Link>
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          <LatestFilterForm filters={filters} types={options.types} countries={options.countries} />
          <p className="text-sm text-text-secondary" aria-live="polite">
            {filtered
              ? `${shown.length} of ${events.length} events match.`
              : `${events.length} event${events.length === 1 ? "" : "s"} in the last ${LATEST_WINDOW_HOURS} hours.`}
          </p>
          {shown.length === 0 ? (
            <div className="max-w-4xl border border-dashed border-border bg-surface-dark px-6 py-8 text-center">
              <p className="text-base text-text-secondary">
                No events match these filters.{" "}
                <Link href="/latest" className="link">
                  Show all →
                </Link>
              </p>
            </div>
          ) : (
            <div className="grid max-w-4xl gap-3">
              {shown.map((event) => (
                <EventLogEntry key={event.event_id} event={event} />
              ))}
            </div>
          )}
        </div>
      )}
    </PageShell>
  );
}
