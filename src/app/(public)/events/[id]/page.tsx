import { pageMetadata } from "@/lib/site-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { formatEventDate, formatUtcTime } from "@/components/event-log-entry";
import { LabelHelp } from "@/components/label-help";
import { PageShell } from "@/components/page-shell";
import { SimilarInNature } from "@/components/historical/similar-in-nature";
import { Badge } from "@/components/ui/badge";
import {
  CONFIDENCE_LEVEL_LABELS,
  DIMENSION_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  EXERCISE_STATUS_LABELS,
  LOCATION_PRECISION_LABELS,
  RESET_STATUS_LABELS,
  SOURCE_RELATIONSHIP_LABELS,
} from "@/lib/event-labels";
import {
  getPublishedEvent,
  listPublicEventSources,
  type PublicEventSource,
} from "@/lib/public-events";
import { listApprovedReferences } from "@/lib/historical-references";
import { referenceLine } from "@/lib/historical-references-rules";
import { isStateOfficialSource, LIVE_STATEMENT_NO_LINK, SOURCE_TYPE_LABELS } from "@/lib/source-labels";

export async function generateMetadata({ params }: PageProps<"/events/[id]">) {
  const { id } = await params;
  return pageMetadata(`/events/${encodeURIComponent(id)}`, "Event", "A reviewed event on NATO's northeastern flank, with its sources, confidence and reset status.");
}

type Field = { label: string; value: string | null | undefined };

function dateOrNull(d: Date | null): string | null {
  return d ? formatEventDate(d) : null;
}

function dateTimeOrNull(d: Date | null): string | null {
  return d ? `${formatEventDate(d)} · ${formatUtcTime(d)}` : null;
}

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
            <dd className="mt-0.5 text-base whitespace-pre-line">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function SourceItem({ source }: { source: PublicEventSource }) {
  return (
    <li className="py-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {source.home_url ? (
          <a
            href={source.home_url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium transition-colors hover:text-link hover:underline"
          >
            {source.name}
          </a>
        ) : (
          <span className="font-medium">{source.name}</span>
        )}
        <Badge variant="outline" className="text-text-secondary">
          {SOURCE_TYPE_LABELS[source.source_type]}
        </Badge>
        {isStateOfficialSource(source) ? (
          <Badge className="bg-slate-indigo text-foreground">
            State / official source
          </Badge>
        ) : null}
        <Badge
          variant="outline"
          className={
            source.relationship === "CONTRADICTS"
              ? "border-destructive/50 text-status-alert"
              : "border-operational-teal/50 text-status-ok"
          }
        >
          {SOURCE_RELATIONSHIP_LABELS[source.relationship]}
        </Badge>
        {source.is_primary ? (
          <span className="font-mono text-xs text-text-muted">PRIMARY</span>
        ) : null}
      </div>
      {source.article_url ? (
        <a
          href={source.article_url}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 block break-all font-mono text-xs link"
        >
          {source.article_url}
        </a>
      ) : (
        <p className="mt-1 font-mono text-xs text-text-muted">{LIVE_STATEMENT_NO_LINK}</p>
      )}
      {source.excerpt ? (
        <blockquote className="mt-2 max-w-3xl border-l-2 border-border pl-3 text-base text-text-secondary">
          {source.excerpt}
        </blockquote>
      ) : null}
    </li>
  );
}

export default async function EventPage({ params }: PageProps<"/events/[id]">) {
  await connection();
  const { id } = await params;
  const [event, sources, references] = await Promise.all([
    getPublishedEvent(id),
    listPublicEventSources(id),
    // Approved links only, with both events PUBLISHED at read time (migration 0010).
    listApprovedReferences(id),
  ]);
  if (!event) notFound();
  const referenceLines = references.map((r) => referenceLine(r, event));

  const location = [
    event.location_name,
    event.location_precision
      ? LOCATION_PRECISION_LABELS[event.location_precision]
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <PageShell>
      <article className="max-w-4xl">
        <Link
          href="/latest"
          className="mb-6 inline-flex items-center gap-1.5 text-sm link"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to latest
        </Link>

        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <p className="font-mono text-xs text-text-secondary">
            {formatEventDate(event.event_date)}
            {event.first_reported ? ` · ${formatUtcTime(event.first_reported)}` : null}
          </p>
          {event.country ? <p className="meta-label">{event.country}</p> : null}
        </div>
        <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-link">
          {EVENT_TYPE_LABELS[event.event_type]}
          {event.event_subtype ? ` · ${event.event_subtype}` : null}
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
          {event.headline}
        </h1>

        <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2 text-base">
          <div>
            <dt className="meta-label">Confidence</dt>
            <dd className="mt-0.5">{CONFIDENCE_LEVEL_LABELS[event.confidence_level]}</dd>
          </div>
          {event.actor ? (
            <div>
              <dt className="meta-label">Actor</dt>
              <dd className="mt-0.5">{event.actor}</dd>
            </div>
          ) : null}
          {location ? (
            <div>
              <dt className="meta-label">Location</dt>
              <dd className="mt-0.5">{location}</dd>
            </div>
          ) : null}
        </dl>

        {event.contradiction_flag ? (
          <div className="mt-6 border border-destructive/40 bg-destructive/10 px-4 py-3 text-base">
            <p className="meta-label mb-1">Conflicting reports</p>
            <p className="text-text-secondary">
              {event.contradiction_notes ??
                "Sources disagree on part of this event. Both are listed below."}
            </p>
          </div>
        ) : null}

        {event.summary ? (
          <p className="mt-6 max-w-3xl leading-relaxed text-text-secondary whitespace-pre-line">
            {event.summary}
          </p>
        ) : null}
        <LabelHelp size="small" className="mt-4 max-w-3xl" />

        <div className="mt-8 grid gap-8">
          <FieldSection
            title="Activity"
            fields={[{ label: "Description", value: event.activity_description }]}
          />
          <FieldSection
            title="Location"
            fields={[
              { label: "Location", value: event.location_name },
              { label: "Region", value: event.region },
              { label: "Country", value: event.country },
              {
                label: "Precision",
                value: event.location_precision
                  ? LOCATION_PRECISION_LABELS[event.location_precision]
                  : null,
              },
            ]}
          />
          <FieldSection
            title="Units and equipment"
            fields={[
              { label: "Unit", value: event.unit_name },
              { label: "Unit type", value: event.unit_type },
              { label: "Home location", value: event.unit_home_location },
              { label: "Personnel estimate", value: event.personnel_estimate },
              { label: "Equipment", value: event.equipment_type },
              { label: "Equipment quantity", value: event.equipment_quantity },
            ]}
          />
          <FieldSection
            title="Exercise"
            fields={[
              { label: "Exercise", value: event.exercise_name },
              {
                label: "Status",
                value: event.exercise_status
                  ? EXERCISE_STATUS_LABELS[event.exercise_status]
                  : null,
              },
            ]}
          />
          <FieldSection
            title="Dates"
            fields={[
              { label: "Reported", value: dateOrNull(event.reported_date) },
              { label: "Announced start", value: dateOrNull(event.announced_start_date) },
              { label: "Announced end", value: dateOrNull(event.announced_end_date) },
              { label: "Observed start", value: dateOrNull(event.observed_start_date) },
              { label: "Observed end", value: dateOrNull(event.observed_end_date) },
              { label: "First reported", value: dateTimeOrNull(event.first_reported) },
              { label: "Last updated", value: dateTimeOrNull(event.last_updated) },
            ]}
          />
          <FieldSection
            title="Post-exercise reset"
            fields={[
              {
                label: "Personnel",
                value: event.personnel_return_status
                  ? DIMENSION_STATUS_LABELS[event.personnel_return_status]
                  : null,
              },
              {
                label: "Equipment",
                value: event.equipment_return_status
                  ? DIMENSION_STATUS_LABELS[event.equipment_return_status]
                  : null,
              },
              {
                label: "Temporary infrastructure",
                value: event.infrastructure_status
                  ? DIMENSION_STATUS_LABELS[event.infrastructure_status]
                  : null,
              },
              { label: "Follow-on activity", value: event.follow_on_activity },
              {
                label: "Overall reset",
                value: event.overall_reset_status
                  ? RESET_STATUS_LABELS[event.overall_reset_status]
                  : null,
              },
            ]}
          />
          <SimilarInNature lines={referenceLines} />
          <section className="border-t border-border pt-5">
            <h2 className="meta-label">
              Sources
              <span className="ml-2 font-mono font-normal text-text-muted">
                {sources.length}
              </span>
            </h2>
            <ul className="divide-y divide-border">
              {sources.map((source, i) => (
                <SourceItem
                  key={`${source.name}-${source.article_url ?? i}`}
                  source={source}
                />
              ))}
            </ul>
          </section>
        </div>
      </article>
    </PageShell>
  );
}
