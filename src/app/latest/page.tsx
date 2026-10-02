import Link from "next/link";
import { connection } from "next/server";
import { EventLogEntry } from "@/components/event-log-entry";
import { LATEST_WINDOW_HOURS, listRecentPublishedEvents } from "@/lib/public-events";

export const metadata = { title: "Latest" };

export default async function LatestPage() {
  await connection();
  const events = await listRecentPublishedEvents();

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="meta-label mb-3">Monitoring feed</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Latest verified events
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
        Events from the last {LATEST_WINDOW_HOURS} hours that have passed human review,
        newest first. Each entry keeps its source and confidence level. Older events are in
        the{" "}
        <Link href="/archive" className="text-teal-blue hover:underline">
          archive
        </Link>
        .
      </p>

      {events.length === 0 ? (
        <div className="mt-10 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">
            No published events in the last {LATEST_WINDOW_HOURS} hours.{" "}
            <Link href="/archive" className="text-teal-blue hover:underline">
              Browse the archive →
            </Link>
          </p>
        </div>
      ) : (
        <div className="mt-8 max-w-4xl divide-y divide-border border-y border-border">
          {events.map((event) => (
            <EventLogEntry key={event.event_id} event={event} />
          ))}
        </div>
      )}
    </section>
  );
}
