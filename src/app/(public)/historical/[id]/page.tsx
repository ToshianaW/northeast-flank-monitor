import { pageMetadata } from "@/lib/site-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { formatEventDate } from "@/components/event-log-entry";
import { HistoricalNotice } from "@/components/historical/historical-notice";
import { PageShell } from "@/components/page-shell";
import { Badge } from "@/components/ui/badge";
import {
  CONFIDENCE_LEVEL_LABELS,
  DIMENSION_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  EXERCISE_STATUS_LABELS,
  LOCATION_PRECISION_LABELS,
  RESET_STATUS_LABELS,
  SOURCE_RELATIONSHIP_LABELS,
  type DimensionStatus,
  type ExerciseStatus,
  type LocationPrecision,
  type ResetStatus,
} from "@/lib/event-labels";
import { FULL_PERIOD, monthLabel, typeSlug } from "@/lib/historical-rules";
import {
  getHistoricalCoverage,
  getPublishedHistorical,
  listPublicHistoricalSources,
} from "@/lib/public-historical";
import { isStateOfficialSource, SOURCE_TYPE_LABELS } from "@/lib/source-labels";

export async function generateMetadata({ params }: PageProps<"/historical/[id]">) {
  const { id } = await params;
  return pageMetadata(`/historical/${encodeURIComponent(id)}`, "Historical event", "A published historical event, with its sources, for comparison with current activity.");
}

type Field = { label: string; value: string | null | undefined };

const day = (d: Date | null) => (d ? formatEventDate(d) : null);

function FieldSection({ title, fields }: { title: string; fields: Field[] }) {
  const shown = fields.filter((f) => f.value);
  if (shown.length === 0) return null;
  return (
    <section className="border-t border-border pt-5">
      <h2 className="meta-label mb-3">{title}</h2>
      <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
        {shown.map((f) => (
          <div key={f.label}>
            <dt className="text-xs text-text-muted">{f.label}</dt>
            <dd className="mt-0.5 whitespace-pre-line text-base">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export default async function HistoricalEventPage({ params }: PageProps<"/historical/[id]">) {
  await connection();
  const { id } = await params;
  const [event, sources, coverage] = await Promise.all([
    getPublishedHistorical(id),
    listPublicHistoricalSources(id),
    getHistoricalCoverage(FULL_PERIOD),
  ]);
  if (!event) notFound();

  const dim = (v: string | null) => (v ? DIMENSION_STATUS_LABELS[v as DimensionStatus] : null);

  return (
    <PageShell>
      <Link
        href={`/historical/type/${typeSlug(event.event_type)}?month=${event.event_date.toISOString().slice(0, 7)}`}
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {EVENT_TYPE_LABELS[event.event_type]} · {monthLabel(event.event_date.toISOString().slice(0, 7))}
      </Link>

      <article className="grid max-w-4xl gap-6">
        <HistoricalNotice coverage={coverage} />

        <header>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{EVENT_TYPE_LABELS[event.event_type]}</Badge>
            <Badge variant="outline">Confidence: {CONFIDENCE_LEVEL_LABELS[event.confidence_level]}</Badge>
            {event.contradiction_flag ? <Badge variant="outline">Conflicting reports</Badge> : null}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">{event.headline}</h1>
          <p className="mt-2 font-mono text-sm text-text-secondary">
            {formatEventDate(event.event_date)}
            {event.country ? ` · ${event.country}` : null}
          </p>
          {event.summary ? <p className="mt-4 max-w-3xl text-base text-text-secondary">{event.summary}</p> : null}
        </header>

        <FieldSection
          title="Activity"
          fields={[
            { label: "Actor", value: event.actor },
            { label: "Region", value: event.region },
            { label: "Location (as reported)", value: event.location_name },
            {
              label: "Location precision",
              value: event.location_precision ? LOCATION_PRECISION_LABELS[event.location_precision as LocationPrecision] : null,
            },
            { label: "Subtype", value: event.event_subtype },
            { label: "Unit", value: [event.unit_name, event.unit_type].filter(Boolean).join(" · ") || null },
            { label: "Unit home location", value: event.unit_home_location },
            { label: "Personnel (reported)", value: event.personnel_estimate },
            { label: "Equipment", value: [event.equipment_type, event.equipment_quantity].filter(Boolean).join(" · ") || null },
            { label: "Description", value: event.activity_description },
            { label: "Reported", value: day(event.reported_date) },
          ]}
        />
        <FieldSection
          title="Exercise and reset"
          fields={[
            { label: "Exercise", value: event.exercise_name },
            {
              label: "Exercise status",
              value: event.exercise_status ? EXERCISE_STATUS_LABELS[event.exercise_status as ExerciseStatus] : null,
            },
            { label: "Announced start", value: day(event.announced_start_date) },
            { label: "Announced end", value: day(event.announced_end_date) },
            { label: "Observed start", value: day(event.observed_start_date) },
            { label: "Observed end", value: day(event.observed_end_date) },
            { label: "Personnel", value: dim(event.personnel_return_status) },
            { label: "Equipment", value: dim(event.equipment_return_status) },
            { label: "Temporary infrastructure", value: dim(event.infrastructure_status) },
            {
              label: "Overall reset",
              value: event.overall_reset_status ? RESET_STATUS_LABELS[event.overall_reset_status as ResetStatus] : null,
            },
            { label: "Follow-on activity", value: event.follow_on_activity },
          ]}
        />
        <FieldSection title="Conflicting reports" fields={[{ label: "Notes", value: event.contradiction_notes }]} />

        <section className="border-t border-border pt-5">
          <h2 className="meta-label mb-3">Sources</h2>
          <ul className="divide-y divide-border">
            {sources.map((s) => (
              <li key={s.article_url} className="py-4">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <span className="font-medium">{s.name}</span>
                  <Badge variant="outline" className="text-text-secondary">
                    {SOURCE_TYPE_LABELS[s.source_type]}
                  </Badge>
                  {isStateOfficialSource(s) ? (
                    <Badge className="bg-slate-indigo text-foreground">State / official source</Badge>
                  ) : null}
                  <Badge variant="outline">{SOURCE_RELATIONSHIP_LABELS[s.relationship]}</Badge>
                </div>
                <blockquote className="mt-2 border-l-2 border-teal-blue/60 pl-3 text-base text-text-secondary">
                  &ldquo;{s.excerpt}&rdquo;
                </blockquote>
                <p className="mt-2 text-sm">
                  <a href={s.article_url} target="_blank" rel="noopener noreferrer" className="link">
                    Read the source
                  </a>
                  {s.archived_url ? (
                    <>
                      {" · "}
                      <a href={s.archived_url} target="_blank" rel="noopener noreferrer" className="link">
                        Archived copy
                      </a>
                    </>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        </section>
      </article>
    </PageShell>
  );
}
