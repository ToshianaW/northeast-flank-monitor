import Link from "next/link";
import { connection } from "next/server";
import { formatDigestDateShort } from "@/components/digest-view";
import { EventLogEntry } from "@/components/event-log-entry";
import { stripDigestRefs } from "@/lib/digest-refs";
import { getLatestPublishedDigest } from "@/lib/digests";
import {
  getSnapshotCounts,
  listPublishedEvents,
} from "@/lib/public-events";

/** Spec §23, verbatim. */
const ACTIVITY_INDEX_DISCLAIMER =
  "The Northeast Flank Activity Index measures observable military activity and force posture. It does not estimate the probability of conflict or predict political intent.";

function Panel({
  title,
  className = "",
  children,
}: {
  title: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`panel ${className}`}
    >
      <h2 className="meta-label mb-4">{title}</h2>
      {children}
    </section>
  );
}

export default async function HomePage() {
  await connection();
  const [counts, latest, digest] = await Promise.all([
    getSnapshotCounts(),
    listPublishedEvents(3),
    getLatestPublishedDigest(),
  ]);
  // The latest PUBLISHED digest's summary, markers stripped (drafts are never read here).
  const digestSummary = digest
    ? stripDigestRefs(digest.sections.executive_summary).trim()
    : "";

  const snapshotRows: Array<{ label: string; value: string }> = [
    { label: "Verified events", value: String(counts.verifiedEvents) },
    { label: "Active exercises", value: String(counts.activeExercises) },
    { label: "New external deployments", value: String(counts.externalDeployments) },
    { label: "Border incidents", value: String(counts.borderIncidents) },
    { label: "Post-exercise reset", value: "No data" },
  ];

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <h1 className="sr-only">Northeast Flank Monitor overview</h1>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-12">
        <Panel title="Regional activity" className="lg:col-span-5">
          <p className="text-lg font-medium text-text-secondary">
            Activity Index: not yet calculated
          </p>
          <p className="mt-3 text-xs leading-relaxed text-text-muted">
            {ACTIVITY_INDEX_DISCLAIMER}
          </p>
        </Panel>

        <Panel title="24-hour snapshot" className="lg:col-span-7">
          <dl className="divide-y divide-border">
            {snapshotRows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline justify-between gap-4 py-2 first:pt-0 last:pb-0"
              >
                <dt className="meta-label">{row.label}</dt>
                <dd className="font-mono text-sm text-foreground">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-text-muted">
            Published events dated today or yesterday (UTC).
          </p>
        </Panel>

        <Panel title="Daily digest" className="md:col-span-2 lg:col-span-12">
          {digest ? (
            <>
              <p className="font-mono text-xs text-text-secondary">
                {formatDigestDateShort(digest.digest_date)}
              </p>
              <h3 className="mt-1 text-base font-medium">
                <Link
                  href={`/digest/${digest.digest_date}`}
                  className="transition-colors hover:text-link hover:underline"
                >
                  {digest.title}
                </Link>
              </h3>
              {digestSummary ? (
                <p className="mt-2 max-w-4xl text-base leading-relaxed whitespace-pre-line text-text-secondary">
                  {digestSummary}
                </p>
              ) : null}
              <Link
                href={`/digest/${digest.digest_date}`}
                className="mt-4 inline-block text-sm link"
              >
                Read the full digest
              </Link>
            </>
          ) : (
            <p className="text-base text-text-secondary">No digest published yet.</p>
          )}
        </Panel>

        <Panel title="Latest verified events" className="md:col-span-2 lg:col-span-8">
          {latest.length === 0 ? (
            <p className="text-base text-text-secondary">No published events yet.</p>
          ) : (
            <div className="grid gap-3">
              {latest.map((event) => (
                <EventLogEntry key={event.event_id} event={event} />
              ))}
            </div>
          )}
          <Link
            href="/latest"
            className="mt-5 inline-block text-sm link"
          >
            View all →
          </Link>
        </Panel>

        <Panel title="Active exercises" className="md:col-span-2 lg:col-span-12">
          <p className="text-base text-text-secondary">
            No exercises are recorded yet.
          </p>
        </Panel>
      </div>
    </div>
  );
}
