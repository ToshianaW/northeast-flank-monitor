import Link from "next/link";
import { connection } from "next/server";
import { EventLogEntry } from "@/components/event-log-entry";
import { PageShell } from "@/components/page-shell";
import { LATEST_WINDOW_HOURS, listRecentPublishedEvents } from "@/lib/public-events";

export const metadata = { title: "Latest" };

export default async function LatestPage() {
  await connection();
  const events = await listRecentPublishedEvents();

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
        <div className="grid max-w-4xl gap-3">
          {events.map((event) => (
            <EventLogEntry key={event.event_id} event={event} />
          ))}
        </div>
      )}
    </PageShell>
  );
}
