import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { HistoricalReviewActions } from "@/components/historical/historical-review-actions";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { requireAdminPage } from "@/lib/admin-session";
import {
  CONFIDENCE_LEVEL_LABELS,
  EVENT_TYPE_LABELS,
  SOURCE_RELATIONSHIP_LABELS,
} from "@/lib/event-labels";
import {
  getHistoricalEvent,
  listHistoricalActions,
  listHistoricalEventSources,
  type HistoricalActionRow,
} from "@/lib/historical";
import { HISTORICAL_FIELD_NAMES, PHASE_TAG_LABELS, type PhaseTag } from "@/lib/historical-rules";
import { suggestConfidence } from "@/lib/confidence-suggestion";
import { getReviewerName } from "@/lib/reviewer";
import { isTier4OnlySupport } from "@/lib/source-labels";

export const metadata = { title: "Review historical event" };

const NOTICES: Record<string, string> = {
  saved: "Saved.",
  approved: "Approved and published.",
  rejected: "Rejected.",
  unpublished: "Unpublished and back in the queue.",
};

function show(value: unknown): string | null {
  if (value == null || value === "") return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value);
}

function actionDetail(a: HistoricalActionRow): string {
  const prev = a.previous_values ?? {};
  const parts: string[] = [];
  if (typeof prev.review_status === "string") parts.push(`was ${prev.review_status}`);
  if (typeof prev.reject_reason === "string") parts.push(`reason: ${prev.reject_reason}`);
  if (typeof prev.unpublish_reason === "string") parts.push(`reason: ${prev.unpublish_reason}`);
  if (a.action === "EDIT" && typeof prev.headline === "string") parts.push(`before: ${prev.headline}`);
  return parts.join(" · ") || "—";
}

export default async function HistoricalReviewPage({ params, searchParams }: PageProps<"/admin/historical/[id]">) {
  await requireAdminPage();
  await connection();
  const { id } = await params;
  const flags = await searchParams;
  const [event, sources, actions, reviewerDefault] = await Promise.all([
    getHistoricalEvent(id),
    listHistoricalEventSources(id),
    listHistoricalActions(id),
    getReviewerName(),
  ]);
  if (!event) notFound();

  const notice = Object.keys(NOTICES).find((k) => flags[k]);
  const supportTiers = sources.filter((s) => s.relationship === "SUPPORTS").map((s) => s.tier);
  const shownFields = HISTORICAL_FIELD_NAMES.filter(
    (f) => !["headline", "summary", "phase_tag", "internal_notes"].includes(f),
  )
    .map((f) => ({ label: f.replace(/_/g, " "), value: show(event[f]) }))
    .filter((f) => f.value);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/historical" label="Back to historical" />
      {notice ? (
        <p role="status" className="mb-4 border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm">
          {NOTICES[notice]}
        </p>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="meta-label mb-2">Admin · historical · {event.review_status}</p>
          <h1 className="max-w-3xl text-2xl font-semibold tracking-tight">{event.headline}</h1>
          <p className="mt-1 font-mono text-xs text-text-secondary">
            {event.event_date.toISOString().slice(0, 10)} · {EVENT_TYPE_LABELS[event.event_type]} · Confidence{" "}
            {CONFIDENCE_LEVEL_LABELS[event.confidence_level]}
          </p>
        </div>
        <div className="flex gap-2">
          {event.review_status === "PUBLISHED" ? (
            <Link href={`/historical/${id}`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              Public page
            </Link>
          ) : null}
          <Link href={`/admin/historical/${id}/edit`} className={buttonVariants({ variant: "outline", size: "sm" })}>
            Edit
          </Link>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-12">
        <div className="grid gap-6 lg:col-span-8">
          {event.summary ? <p className="max-w-3xl text-base text-text-secondary">{String(event.summary)}</p> : null}

          <div className="grid gap-2 border border-border bg-surface-dark p-4 text-sm">
            <p>
              <span className="text-text-muted">Phase tag (admin only):</span>{" "}
              {event.phase_tag ? PHASE_TAG_LABELS[event.phase_tag as PhaseTag] : "not set"}
            </p>
            {event.internal_notes ? (
              <p>
                <span className="text-text-muted">Internal notes:</span> {String(event.internal_notes)}
              </p>
            ) : null}
          </div>

          {shownFields.length ? (
            <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {shownFields.map((f) => (
                <div key={f.label}>
                  <dt className="text-xs capitalize text-text-muted">{f.label}</dt>
                  <dd className="mt-0.5 text-sm">{f.value}</dd>
                </div>
              ))}
            </dl>
          ) : null}

          <section>
            <h2 className="meta-label mb-3">Sources ({sources.length})</h2>
            {supportTiers.length === 0 ? (
              <p className="mb-3 text-sm text-destructive">No supporting source: cannot be published.</p>
            ) : isTier4OnlySupport(supportTiers) ? (
              <p className="mb-3 text-sm text-destructive">Tier 4-only support: cannot be published.</p>
            ) : null}
            <ul className="grid gap-3">
              {sources.map((s) => (
                <li key={`${s.source_id}-${s.article_url}`} className="border border-border bg-surface-dark p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.name}</span>
                    <Badge variant="outline">{s.tier === null ? "Tier —" : `Tier ${s.tier}`}</Badge>
                    <Badge variant="outline">{SOURCE_RELATIONSHIP_LABELS[s.relationship]}</Badge>
                    {s.is_primary ? <Badge>Primary</Badge> : null}
                    {s.historical_only ? <Badge variant="outline">Historical only</Badge> : null}
                  </div>
                  <blockquote className="mt-2 border-l-2 border-teal-blue/60 pl-3 text-sm text-text-secondary">
                    &ldquo;{s.excerpt}&rdquo;
                  </blockquote>
                  <p className="mt-2 text-xs text-text-muted">
                    <a href={s.article_url} target="_blank" rel="noopener noreferrer" className="link">
                      Article
                    </a>
                    {s.archived_url ? (
                      <>
                        {" · "}
                        <a href={s.archived_url} target="_blank" rel="noopener noreferrer" className="link">
                          Archived copy
                        </a>
                      </>
                    ) : null}
                    {" · read "}
                    {s.accessed_at.toISOString().slice(0, 10)}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <aside className="grid content-start gap-6 lg:col-span-4">
          <section>
            <h2 className="meta-label mb-3">Review</h2>
            <HistoricalReviewActions
              eventId={id}
              status={event.review_status}
              reviewerDefault={reviewerDefault}
              suggestion={suggestConfidence({ sources, contradiction_flag: event.contradiction_flag })}
            />
          </section>
          <section>
            <h2 className="meta-label mb-3">Audit log</h2>
            <ol className="grid gap-2 text-xs">
              {actions.map((a) => (
                <li key={a.id} className="border border-border p-2">
                  <p className="font-mono">
                    {a.created_at.toISOString().replace("T", " ").slice(0, 16)} · {a.action} · {a.reviewer}
                  </p>
                  <p className="mt-1 text-text-muted">{actionDetail(a)}</p>
                </li>
              ))}
            </ol>
          </section>
        </aside>
      </div>
    </section>
  );
}
