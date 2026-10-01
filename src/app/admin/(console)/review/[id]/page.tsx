import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { ReviewEventActions } from "@/components/admin/review-event-actions";
import { Badge } from "@/components/ui/badge";
import {
  CONFIDENCE_LEVEL_LABELS,
  EVENT_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/event-labels";
import { getEvent } from "@/lib/events";
import {
  listMergeTargetOptions,
  listReviewActions,
  type ReviewActionRow,
} from "@/lib/review";
import { getReviewerName } from "@/lib/reviewer";

export const metadata = { title: "Review event" };

function formatWhen(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function summarizePreviousValues(action: ReviewActionRow): string {
  const prev = action.previous_values;
  if (!prev || typeof prev !== "object") return "—";
  if (action.action === "APPROVE" || action.action === "REJECT") {
    const o = prev as { review_status?: string; reject_reason?: string };
    const parts = [`review_status: ${o.review_status ?? "?"}`];
    if (o.reject_reason) parts.push(`reason: ${o.reject_reason}`);
    return parts.join("; ");
  }
  if (action.action === "EDIT" || action.action === "MERGE") {
    const o = prev as { headline?: string; review_status?: string };
    return `snapshot: ${o.headline ?? "event row"} (${o.review_status ?? "?"})`;
  }
  return JSON.stringify(prev);
}

export default async function ReviewEventPage({
  params,
  searchParams,
}: PageProps<"/admin/review/[id]">) {
  await connection();
  const { id } = await params;
  const flags = await searchParams;

  const [event, history, mergeTargets, reviewerDefault] = await Promise.all([
    getEvent(id),
    listReviewActions(id),
    listMergeTargetOptions(id),
    getReviewerName(),
  ]);

  if (!event) notFound();

  const editHref = `/admin/events/${id}/edit?fromReview=1`;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/review" label="Back to review queue" />
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta-label mb-2">Admin · review</p>
          <h1 className="text-2xl font-semibold tracking-tight">{event.headline}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-text-secondary">
            <span className="font-mono text-xs">
              {event.event_date.toISOString().slice(0, 10)}
            </span>
            <span>{EVENT_TYPE_LABELS[event.event_type]}</span>
            <Badge variant="outline">{REVIEW_STATUS_LABELS[event.review_status]}</Badge>
            <span>{CONFIDENCE_LEVEL_LABELS[event.confidence_level]}</span>
            {event.contradiction_flag ? (
              <Badge variant="outline" className="border-destructive/50 text-destructive">
                Contradiction flagged
              </Badge>
            ) : null}
          </p>
        </div>
      </div>

      {flags.submitted ? (
        <p role="status" className="mb-4 border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm">
          Submitted for review.
        </p>
      ) : null}
      {flags.approved ? (
        <p role="status" className="mb-4 border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm">
          Event published.
        </p>
      ) : null}
      {flags.rejected ? (
        <p role="status" className="mb-4 border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm">
          Event rejected.
        </p>
      ) : null}
      {flags.merged ? (
        <p role="status" className="mb-4 border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm">
          Event merged away; source links moved to the target.
        </p>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-2">
        <ReviewEventActions
          eventId={id}
          reviewStatus={event.review_status}
          reviewerDefault={reviewerDefault}
          mergeTargets={mergeTargets.map((t) => ({
            event_id: t.event_id,
            headline: t.headline,
            event_date: t.event_date.toISOString().slice(0, 10),
          }))}
          editHref={editHref}
        />

        <div>
          <h2 className="mb-3 text-sm font-semibold tracking-tight">Action history</h2>
          {history.length === 0 ? (
            <p className="text-sm text-text-secondary">No review actions logged yet.</p>
          ) : (
            <ol className="divide-y divide-border border border-border">
              {history.map((row) => (
                <li key={row.id} className="px-4 py-3 text-sm">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="font-medium">{row.action}</span>
                    <span className="font-mono text-xs text-text-muted">
                      {formatWhen(row.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-text-secondary">
                    {row.reviewer} · {row.event_type} ·{" "}
                    {row.source_ids.length} source
                    {row.source_ids.length === 1 ? "" : "s"}
                  </p>
                  {row.merged_into_event_id ? (
                    <p className="mt-1 text-xs">
                      Merged into{" "}
                      <Link
                        href={`/admin/review/${row.merged_into_event_id}`}
                        className="text-teal-blue hover:underline"
                      >
                        {row.merged_into_event_id}
                      </Link>
                    </p>
                  ) : null}
                  <p className="mt-2 text-xs text-text-muted">
                    {summarizePreviousValues(row)}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </section>
  );
}
