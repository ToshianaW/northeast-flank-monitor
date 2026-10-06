import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ExternalLink } from "lucide-react";
import { BackLink } from "@/components/admin/back-link";
import { ReviewEventActions } from "@/components/admin/review-event-actions";
import { XPostCopy } from "@/components/admin/x-post-copy";
import { Badge } from "@/components/ui/badge";
import {
  CONFIDENCE_LEVEL_LABELS,
  EVENT_TYPE_LABELS,
  EXERCISE_STATUS_LABELS,
  LOCATION_PRECISION_LABELS,
  REVIEW_STATUS_LABELS,
  SOURCE_RELATIONSHIP_LABELS,
} from "@/lib/event-labels";
import { suggestConfidence } from "@/lib/confidence-suggestion";
import { getEvent } from "@/lib/events";
import {
  getEventXBreaking,
  getReviewEventDetail,
  listDuplicateCandidates,
  listMergeTargetOptions,
  listReviewActions,
  type DuplicateCandidate,
  type ReviewActionRow,
  type ReviewEventSource,
} from "@/lib/review";
import { getReviewerName } from "@/lib/reviewer";
import {
  isStateOfficialSource,
  isTier4OnlySupport,
  LIVE_STATEMENT_NO_LINK,
  RELIABILITY_LABELS,
  SOCIAL_POST_NO_LINK,
  SOURCE_TYPE_LABELS,
} from "@/lib/source-labels";
import { requireAdminPage } from "@/lib/admin-session";
import { buildPostText, postWeight } from "@/lib/x-text";

export const metadata = { title: "Review event" };

function formatWhen(d: Date) {
  return d.toISOString().replace("T", " ").slice(0, 19);
}

function formatDay(d: Date | null): string | null {
  return d ? d.toISOString().slice(0, 10) : null;
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

function duplicateBasisLabel(d: DuplicateCandidate): string {
  const similarity = `headline similarity ${Math.round(d.headline_similarity * 100)}%`;
  if (d.basis === "SAME_ARTICLE") return "cites the same article";
  if (d.basis === "MODEL") return `${similarity} · model: ${d.model_verdict === "SAME" ? "same event" : "unsure"}`;
  const skipped = {
    NO_AI_SOURCE: " · not sent to model (no-AI source)",
    NO_MODEL: " · model not used",
    SPEND_CAP: " · model not used (spend cap)",
  };
  return `${similarity}${d.model_skipped ? skipped[d.model_skipped] : ""}`;
}

function tierLabel(tier: number | null): string {
  return tier === null ? "Tier —" : `Tier ${tier}`;
}

function DetailList({ fields }: { fields: Array<{ label: string; value: string | null }> }) {
  const shown = fields.filter((f) => f.value);
  if (shown.length === 0) return null;
  return (
    <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((f) => (
        <div key={f.label}>
          <dt className="text-xs text-text-muted">{f.label}</dt>
          <dd className="mt-0.5 text-sm">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PrimarySourceBox({ source }: { source: ReviewEventSource | undefined }) {
  if (!source) {
    return (
      <div className="border border-border bg-surface-dark/60 px-4 py-3 text-sm text-text-secondary">
        No primary source.
      </div>
    );
  }
  return (
    <div className="border border-border bg-surface-dark/60 px-4 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{source.name}</span>
          {source.social_account ? (
            <Badge variant="outline" className="text-text-secondary">Social media · {source.social_account}</Badge>
          ) : null}
          <Badge variant="outline">{tierLabel(source.tier)}</Badge>
          <Badge variant="outline">{RELIABILITY_LABELS[source.reliability]} reliability</Badge>
          <Badge variant="outline" className="text-text-secondary">
            {SOURCE_TYPE_LABELS[source.source_type]}
          </Badge>
          {isStateOfficialSource(source) ? (
            <Badge className="bg-slate-indigo text-foreground">State / official source</Badge>
          ) : null}
        </div>
        {source.article_url ? (
          <a
            href={source.article_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 border border-teal-blue/60 px-3 py-1.5 text-sm text-teal-blue hover:bg-teal-blue/10"
          >
            Open article
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        ) : (
          <span className="text-sm text-text-muted">
            {source.social_account ? SOCIAL_POST_NO_LINK : LIVE_STATEMENT_NO_LINK}
          </span>
        )}
      </div>
      {source.excerpt ? (
        <blockquote className="mt-3 border-l-2 border-teal-blue/60 pl-3 text-sm text-text-secondary">
          &ldquo;{source.excerpt}&rdquo;
        </blockquote>
      ) : null}
    </div>
  );
}

export default async function ReviewEventPage({
  params,
  searchParams,
}: PageProps<"/admin/review/[id]">) {
  await requireAdminPage();
  await connection();
  const { id } = await params;
  const { mergeTarget } = await searchParams;

  const [event, detail, duplicates, history, mergeTargets, reviewerDefault, xBreaking] = await Promise.all([
    getEvent(id),
    getReviewEventDetail(id),
    listDuplicateCandidates(id),
    listReviewActions(id),
    listMergeTargetOptions(id),
    getReviewerName(),
    getEventXBreaking(id),
  ]);

  if (!event) notFound();

  const editHref = `/admin/events/${id}/edit?fromReview=1`;
  const canModerate = event.review_status === "DRAFT" || event.review_status === "PENDING_REVIEW";
  const { sources, extraction_run_id } = detail;
  const isAiDraft = extraction_run_id !== null;
  const primary = sources.find((s) => s.is_primary) ?? sources.find((s) => s.relationship === "SUPPORTS");
  const supports = sources.filter((s) => s.relationship === "SUPPORTS");
  // Same link choice as the X poster: the primary supporting source, never a contradicting one.
  const xPost = buildPostText({
    summary: event.summary,
    headline: event.headline,
    sourceUrl: (() => {
      const linked = supports.filter((s) => s.article_url);
      return (linked.find((s) => s.is_primary) ?? linked[0])?.article_url ?? event.source_url;
    })(),
    // Before approval this shows NEW; the reviewer can choose BREAKING when approving.
    alert: { countries: [event.country], breaking: xBreaking },
  });

  const warnings = [
    supports.length === 0 ? "No supporting source attached." : null,
    isTier4OnlySupport(supports.map((s) => s.tier))
      ? "Supported only by Tier 4 sources. Cannot be published without a Tier 1-3 source."
      : null,
    event.contradiction_flag || sources.some((s) => s.relationship === "CONTRADICTS")
      ? "Sources conflict."
      : null,
  ].filter((w): w is string => w !== null);

  const location = [
    event.location_name,
    event.location_precision ? `(${LOCATION_PRECISION_LABELS[event.location_precision]})` : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/review" label="Back to review queue" />

      {/* 1. Header */}
      <header className="mb-4">
        <p className="meta-label mb-2">Admin · review</p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">{event.headline}</h1>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline">{REVIEW_STATUS_LABELS[event.review_status]}</Badge>
            <Badge variant="outline">{CONFIDENCE_LEVEL_LABELS[event.confidence_level]}</Badge>
            {isAiDraft ? (
              <Badge variant="outline" className="border-teal-blue/60 text-teal-blue">
                AI draft
              </Badge>
            ) : null}
          </div>
        </div>
      </header>

      <div className="grid gap-8">
        {/* 2. Primary source */}
        <PrimarySourceBox source={primary} />

        {/* 3. Warnings */}
        {warnings.length > 0 ? (
          <ul className="grid gap-1 border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        ) : null}

        {/* Possible duplicates (step 2.3): suggestions only; merging uses the merge form below. */}
        {duplicates.length > 0 ? (
          <section className="border border-border px-4 py-3">
            <h2 className="meta-label mb-2">Possible duplicates</h2>
            <ul className="grid gap-3">
              {duplicates.map((d) => (
                <li key={d.other_event_id} className="text-sm">
                  <p>
                    Possible duplicate of{" "}
                    <Link
                      href={`/admin/review/${d.other_event_id}`}
                      className="font-medium text-teal-blue hover:underline"
                    >
                      {d.other_headline}
                    </Link>
                  </p>
                  <p className="mt-0.5 font-mono text-xs text-text-muted">
                    {formatDay(d.other_event_date)} · {REVIEW_STATUS_LABELS[d.other_review_status]} ·{" "}
                    {duplicateBasisLabel(d)}
                  </p>
                  {d.model_reason ? (
                    <p className="mt-0.5 text-xs text-text-secondary">Model: {d.model_reason}</p>
                  ) : null}
                  {canModerate || (event.review_status === "PUBLISHED" && d.other_review_status === "PUBLISHED") ? (
                    <Link
                      href={`/admin/review/${id}?mergeTarget=${d.other_event_id}#merge`}
                      className="mt-1 inline-block text-xs text-teal-blue hover:underline"
                    >
                      Merge this event into it →
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {/* 4. Event details */}
        <section className="grid gap-5 border-t border-border pt-5">
          <h2 className="meta-label">Event details</h2>
          {isAiDraft ? (
            <div className="grid gap-6 md:grid-cols-2">
              <div>
                <p className="text-xs text-text-muted">Model&apos;s original summary</p>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">
                  {event.ai_generated_summary ?? "—"}
                </p>
              </div>
              <div>
                <p className="text-xs text-text-muted">Current summary</p>
                <p className="mt-1 text-sm leading-relaxed whitespace-pre-line">
                  {event.summary ?? "—"}
                </p>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-text-muted">Summary</p>
              <p className="mt-1 max-w-3xl text-sm leading-relaxed whitespace-pre-line">
                {event.summary ?? "—"}
              </p>
            </div>
          )}
          <DetailList
            fields={[
              { label: "Event date", value: formatDay(event.event_date) },
              { label: "Event type", value: EVENT_TYPE_LABELS[event.event_type] },
              { label: "Actor", value: event.actor },
              { label: "Country", value: event.country },
              { label: "Location", value: location || null },
              { label: "Announced start", value: formatDay(event.announced_start_date) },
              { label: "Announced end", value: formatDay(event.announced_end_date) },
              { label: "Observed start", value: formatDay(event.observed_start_date) },
              { label: "Observed end", value: formatDay(event.observed_end_date) },
              { label: "Exercise", value: event.exercise_name },
              {
                label: "Exercise status",
                value: event.exercise_status ? EXERCISE_STATUS_LABELS[event.exercise_status] : null,
              },
            ]}
          />
          {isAiDraft && event.internal_notes ? (
            <div>
              <p className="text-xs text-text-muted">Extraction notes (internal, admin only)</p>
              <p className="mt-1 border-l-2 border-border pl-3 font-mono text-xs leading-relaxed text-text-secondary whitespace-pre-line">
                {event.internal_notes}
              </p>
            </div>
          ) : null}
        </section>

        {/* 5. All sources */}
        <section className="border-t border-border pt-5">
          <h2 className="meta-label mb-3">
            All sources
            <span className="ml-2 font-mono font-normal text-text-muted">{sources.length}</span>
          </h2>
          {sources.length === 0 ? (
            <p className="text-sm text-text-secondary">No sources attached.</p>
          ) : (
            <div className="overflow-x-auto border border-border">
              <table className="w-full min-w-[48rem] text-left text-sm">
                <thead className="border-b border-border text-xs text-text-muted">
                  <tr>
                    <th className="px-3 py-2 font-normal">Source</th>
                    <th className="px-3 py-2 font-normal">Tier</th>
                    <th className="px-3 py-2 font-normal">Reliability</th>
                    <th className="px-3 py-2 font-normal">Relationship</th>
                    <th className="px-3 py-2 font-normal">Primary</th>
                    <th className="px-3 py-2 font-normal">Article</th>
                    <th className="px-3 py-2 font-normal">Excerpt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border align-top">
                  {sources.map((s, i) => (
                    <tr key={`${s.name}-${s.article_url ?? i}`}>
                      <td className="px-3 py-2 font-medium">
                        {s.name}
                        {s.social_account ? (
                          <span className="block text-xs font-normal text-text-muted">Social media · {s.social_account}</span>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{s.tier ?? "—"}</td>
                      <td className="px-3 py-2">{RELIABILITY_LABELS[s.reliability]}</td>
                      <td
                        className={
                          s.relationship === "CONTRADICTS"
                            ? "px-3 py-2 text-destructive"
                            : "px-3 py-2 text-operational-teal"
                        }
                      >
                        {SOURCE_RELATIONSHIP_LABELS[s.relationship]}
                      </td>
                      <td className="px-3 py-2 font-mono text-xs">{s.is_primary ? "PRIMARY" : ""}</td>
                      <td className="px-3 py-2">
                        {s.article_url ? (
                          <a
                            href={s.article_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="break-all font-mono text-xs text-teal-blue hover:underline"
                          >
                            {s.article_url}
                          </a>
                        ) : (
                          <span className="text-xs text-text-muted">
                            {s.social_account ? SOCIAL_POST_NO_LINK : LIVE_STATEMENT_NO_LINK}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-text-secondary">
                        {s.excerpt ? <>&ldquo;{s.excerpt}&rdquo;</> : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Copy-ready X post (admin only; posted by hand) */}
        <XPostCopy
          text={xPost.ok ? xPost.text : null}
          weight={xPost.ok ? postWeight(xPost.text) : 0}
          refusal={xPost.ok ? null : xPost.reason}
        />

        {/* 6. Actions (unchanged) */}
        <section className="border-t border-border pt-5">
          <ReviewEventActions
            eventId={id}
            reviewStatus={event.review_status}
            confidenceLevel={event.confidence_level}
            confidenceSuggestion={suggestConfidence({
              sources,
              contradiction_flag: event.contradiction_flag,
            })}
            reviewerDefault={reviewerDefault}
            mergeTargets={mergeTargets.map((t) => ({
              event_id: t.event_id,
              headline: t.headline,
              event_date: t.event_date.toISOString().slice(0, 10),
              review_status: t.review_status,
            }))}
            editHref={editHref}
            defaultMergeTarget={
              typeof mergeTarget === "string" && mergeTargets.some((t) => t.event_id === mergeTarget)
                ? mergeTarget
                : undefined
            }
          />
        </section>

        {/* 7. Action history (unchanged) */}
        <section className="border-t border-border pt-5">
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
        </section>
      </div>
    </section>
  );
}
