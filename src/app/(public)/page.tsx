import Link from "next/link";
import { connection } from "next/server";
import { BadgeCheck, CalendarRange, MapPin, Truck, type LucideIcon } from "lucide-react";
import { formatDigestDate } from "@/components/digest-view";
import { EventLogEntry } from "@/components/event-log-entry";
import { ExerciseLogEntry } from "@/components/exercise-log-entry";
import { MapThumbnail } from "@/components/map/map-thumbnail";
import { PageShell } from "@/components/page-shell";
import { stripDigestRefs } from "@/lib/digest-refs";
import { getLatestPublishedDigest } from "@/lib/digests";
import type { ToneClass } from "@/lib/event-tones";
import {
  getSnapshotCounts,
  listPublishedEvents,
} from "@/lib/public-events";
import {
  DASHBOARD_MAP_LAYER,
  DEFAULT_MAP_WINDOW,
  loadMapData,
  loadTheaterGeo,
} from "@/lib/map-data";
import { listUnderWayExercises } from "@/lib/public-exercises";
import { ActivityIndexPanel } from "@/components/activity-index-panel";
import { getActivityIndex } from "@/lib/activity-index-data";

const FEED_SIZE = 3;

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
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default async function HomePage() {
  await connection();
  const [counts, latest, digest, activeExercises, mapData, mapGeo, activityIndex] = await Promise.all([
    getSnapshotCounts(),
    listPublishedEvents(FEED_SIZE),
    getLatestPublishedDigest(),
    listUnderWayExercises(),
    loadMapData({ days: DEFAULT_MAP_WINDOW, layer: DASHBOARD_MAP_LAYER }),
    loadTheaterGeo(),
    getActivityIndex(),
  ]);
  // First paragraph of the Executive Summary as the homepage excerpt.
  const firstParagraph = digest?.sections.executive_summary
    .split(/\n\s*\n/)
    .find((p) => p.trim() !== "");
  const digestExcerpt = firstParagraph ? stripDigestRefs(firstParagraph) : undefined;

  const stats: Array<{ label: string; value: number; icon: LucideIcon; tone: ToneClass }> = [
    { label: "Verified events", value: counts.verifiedEvents, icon: BadgeCheck, tone: "tone-operational" },
    { label: "Active exercises", value: counts.activeExercises, icon: CalendarRange, tone: "tone-teal-blue" },
    { label: "New external deployments", value: counts.externalDeployments, icon: Truck, tone: "tone-slate" },
    { label: "Border incidents", value: counts.borderIncidents, icon: MapPin, tone: "tone-foam" },
  ];

  const feed = (
    <Panel title="Latest verified events">
      {latest.length === 0 ? (
        <p className="text-base text-text-secondary">No published events yet.</p>
      ) : (
        <div className="-mx-2 divide-y divide-border">
          {latest.map((event) => (
            <div key={event.event_id} className="py-2 first:pt-0 last:pb-0">
              <EventLogEntry event={event} variant="row" />
            </div>
          ))}
        </div>
      )}
      <Link href="/latest" className="btn-pill mt-5">
        View all →
      </Link>
    </Panel>
  );

  return (
    <PageShell
      eyebrow="Overview"
      title="Regional dashboard"
      intro={
        <p>
          Verified, published activity across Kaliningrad, Belarus, Poland and
          the Baltic states.
        </p>
      }
      aside={feed}
      asideLabel="Latest verified events"
    >
      <div className="grid gap-6">
        <section aria-labelledby="snapshot-heading">
          <h2 id="snapshot-heading" className="mb-3 text-base font-semibold text-foreground">
            24-hour snapshot
          </h2>
          <ul className="grid grid-cols-1 gap-5 sm:grid-cols-2 2xl:grid-cols-4">
            {stats.map((stat) => (
              <li key={stat.label} className={`panel flex items-center gap-4 ${stat.tone}`}>
                <span
                  className="tint flex size-11 shrink-0 items-center justify-center rounded-xl"
                  aria-hidden
                >
                  <stat.icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <p
                    className="font-mono text-[34px] leading-none font-semibold tabular-nums"
                    style={{ color: "var(--tone)" }}
                  >
                    {stat.value}
                  </p>
                  <p className="mt-2 text-xs font-medium tracking-wider text-text-secondary uppercase">
                    {stat.label}
                  </p>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-text-muted">
            Published events dated today or yesterday (UTC).
          </p>
        </section>

        <Panel title="Regional activity">
          <ActivityIndexPanel result={activityIndex} />
        </Panel>

        <Panel title="Regional map">
          <MapThumbnail data={mapData} geo={mapGeo} />
        </Panel>

        <Panel title="Daily digest">
          {digest ? (
            <>
              <p className="font-mono text-xs text-text-secondary">
                {formatDigestDate(digest.digest_date)}
              </p>
              <h3 className="mt-1 text-lg font-medium">
                <Link
                  href={`/digest/${digest.digest_date}`}
                  className="transition-colors hover:text-link hover:underline"
                >
                  {digest.title}
                </Link>
              </h3>
              {digestExcerpt ? (
                <p className="mt-3 max-w-[65ch] text-base leading-7 whitespace-pre-line text-text-secondary">
                  {digestExcerpt}
                </p>
              ) : null}
              <Link
                href={`/digest/${digest.digest_date}`}
                className="btn-pill mt-5"
              >
                Read full digest →
              </Link>
            </>
          ) : (
            <p className="text-base text-text-secondary">No digest published yet.</p>
          )}
        </Panel>

        <Panel title="Active exercises">
          {activeExercises.length === 0 ? (
            <p className="text-base text-text-secondary">
              No exercises are recorded yet.
            </p>
          ) : (
            <div className="-mx-2 divide-y divide-border">
              {activeExercises.map((exercise) => (
                <div key={exercise.id} className="py-2 first:pt-0 last:pb-0">
                  <ExerciseLogEntry exercise={exercise} variant="row" />
                </div>
              ))}
            </div>
          )}
          <Link href="/exercises" className="btn-pill mt-5">
            All exercises →
          </Link>
        </Panel>
      </div>
    </PageShell>
  );
}
