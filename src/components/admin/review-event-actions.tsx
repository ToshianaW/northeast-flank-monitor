"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import {
  approveEventAction,
  mergeEventAction,
  rejectEventAction,
  submitForReviewAction,
  type ReviewActionState,
} from "@/app/admin/(console)/review/actions";
import { ReviewerField } from "@/components/admin/reviewer-field";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import {
  CONFIDENCE_LEVEL_LABELS,
  CONFIDENCE_LEVEL_VALUES,
  type ConfidenceLevel,
  type ReviewStatus,
} from "@/lib/event-labels";
import {
  CONFLICT_WARNING,
  OFFICIAL_ONLY_NOTE,
  type ConfidenceSuggestion,
} from "@/lib/confidence-suggestion";

type MergeTarget = { event_id: string; headline: string; event_date: string; review_status: ReviewStatus };

function MergeTargetSelect({
  targets,
  defaultValue,
}: {
  targets: MergeTarget[];
  defaultValue?: string;
}) {
  const selected = defaultValue && targets.some((t) => t.event_id === defaultValue) ? defaultValue : "";
  return (
    <div className="grid gap-2">
      <Label htmlFor="target_event_id">Target event</Label>
      <NativeSelect
        key={selected}
        id="target_event_id"
        name="target_event_id"
        required
        defaultValue={selected}
        className="w-full"
      >
        <NativeSelectOption value="">Choose…</NativeSelectOption>
        {targets.map((target) => (
          <NativeSelectOption key={target.event_id} value={target.event_id}>
            {target.event_date} — {target.headline}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

type Props = {
  eventId: string;
  reviewStatus: ReviewStatus;
  confidenceLevel: ConfidenceLevel;
  confidenceSuggestion: ConfidenceSuggestion | null;
  reviewerDefault: string | null;
  mergeTargets: MergeTarget[];
  editHref: string;
  /** Pre-selects the merge target (from a "Possible duplicate" link). Merging still needs a click. */
  defaultMergeTarget?: string;
};

function ActionForm({
  action,
  eventId,
  reviewerDefault,
  children,
  submitLabel,
}: {
  action: (
    eventId: string,
    state: ReviewActionState,
    formData: FormData,
  ) => Promise<ReviewActionState>;
  eventId: string;
  reviewerDefault: string | null;
  children?: React.ReactNode;
  submitLabel: string;
}) {
  const bound = action.bind(null, eventId) as (
    state: ReviewActionState,
    formData: FormData,
  ) => Promise<ReviewActionState>;
  const [state, formAction, pending] = useActionState(bound, {});

  return (
    <form action={formAction} className="grid gap-3 border border-border p-4">
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <ReviewerField defaultValue={reviewerDefault} />
      {children}
      <Button type="submit" disabled={pending} size="sm">
        {pending ? "Working…" : submitLabel}
      </Button>
    </form>
  );
}

/** Rule-based hint from the attached sources (decision #13). It never changes the selection. */
function SuggestionHint({ suggestion }: { suggestion: ConfidenceSuggestion | null }) {
  if (!suggestion) {
    return <p className="text-xs text-text-muted">Suggested: none (no supporting source)</p>;
  }
  return (
    <div className="grid gap-1 text-xs text-text-muted">
      <p>
        Suggested: {CONFIDENCE_LEVEL_LABELS[suggestion.level]} ({suggestion.reason})
        {suggestion.stateSource ? (
          <Badge variant="outline" className="ml-2 border-slate-indigo text-text-secondary">
            State / official source
          </Badge>
        ) : null}
      </p>
      {suggestion.officialOnlyNote ? <p>{OFFICIAL_ONLY_NOTE}</p> : null}
      {suggestion.conflictWarning ? (
        <p className="text-foreground">{CONFLICT_WARNING}</p>
      ) : null}
    </div>
  );
}

/** Confidence must be chosen at approval; prefilled with the event's current value. */
function ConfidenceField({
  defaultValue,
  suggestion,
}: {
  defaultValue: ConfidenceLevel;
  suggestion: ConfidenceSuggestion | null;
}) {
  const [value, setValue] = useState<ConfidenceLevel>(defaultValue);
  return (
    <div className="grid gap-2">
      <Label htmlFor="confidence_level">Confidence</Label>
      <NativeSelect
        id="confidence_level"
        name="confidence_level"
        required
        value={value}
        onChange={(e) => setValue(e.target.value as ConfidenceLevel)}
        className="w-full"
      >
        {CONFIDENCE_LEVEL_VALUES.map((level) => (
          <NativeSelectOption key={level} value={level}>
            {CONFIDENCE_LEVEL_LABELS[level]}
          </NativeSelectOption>
        ))}
      </NativeSelect>
      <SuggestionHint suggestion={suggestion} />
      {value === "UNVERIFIED" ? (
        <p role="alert" className="border-l-2 border-teal-blue pl-3 text-xs text-foreground">
          Unverified events appear only under Contradictions &amp; Unverified
          Reporting in the daily digest.
        </p>
      ) : null}
    </div>
  );
}

export function ReviewEventActions({
  eventId,
  reviewStatus,
  confidenceLevel,
  confidenceSuggestion,
  reviewerDefault,
  mergeTargets,
  editHref,
  defaultMergeTarget,
}: Props) {
  const canModerate =
    reviewStatus === "DRAFT" || reviewStatus === "PENDING_REVIEW";

  return (
    <div className="grid gap-6">
      <div>
        <Link href={editHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
          Edit event
        </Link>
        <p className="mt-1 text-xs text-text-muted">
          Saves from edit log an EDIT review action when opened from this review page.
        </p>
      </div>

      {canModerate ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {reviewStatus === "DRAFT" ? (
            <ActionForm
              action={submitForReviewAction}
              eventId={eventId}
              reviewerDefault={reviewerDefault}
              submitLabel="Submit for review"
            />
          ) : null}

          <ActionForm
            action={approveEventAction}
            eventId={eventId}
            reviewerDefault={reviewerDefault}
            submitLabel="Approve and publish"
          >
            <ConfidenceField defaultValue={confidenceLevel} suggestion={confidenceSuggestion} />
            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="x_breaking" className="mt-0.5 size-4 accent-teal-blue" />
              <span>
                Post on X as 🚨 BREAKING
                <span className="block text-xs text-text-muted">
                  Extreme situations only. Otherwise the post starts &ldquo;🚨 NEW:&rdquo; with the country&apos;s flag.
                </span>
              </span>
            </label>
          </ActionForm>

          <ActionForm
            action={rejectEventAction}
            eventId={eventId}
            reviewerDefault={reviewerDefault}
            submitLabel="Reject"
          >
            <div className="grid gap-2">
              <Label htmlFor="reject_reason">Rejection reason</Label>
              <Input
                id="reject_reason"
                name="reject_reason"
                required
                minLength={3}
                maxLength={500}
              />
            </div>
          </ActionForm>

          <div id="merge" className="grid">
            <ActionForm
              action={mergeEventAction}
              eventId={eventId}
              reviewerDefault={reviewerDefault}
              submitLabel="Merge into target"
            >
              <MergeTargetSelect targets={mergeTargets} defaultValue={defaultMergeTarget} />
            </ActionForm>
          </div>
        </div>
      ) : reviewStatus === "PUBLISHED" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <ActionForm
            action={rejectEventAction}
            eventId={eventId}
            reviewerDefault={reviewerDefault}
            submitLabel="Remove from site"
          >
            <p className="text-xs text-text-muted">
              Takes the event off every public page, the map, the sitemap and open data. It stays
              here as Rejected, with its history. Nothing is deleted.
            </p>
            <div className="grid gap-2">
              <Label htmlFor="reject_reason">Reason for removal</Label>
              <Input
                id="reject_reason"
                name="reject_reason"
                required
                minLength={3}
                maxLength={500}
              />
            </div>
          </ActionForm>

          <div id="merge" className="grid">
            <ActionForm
              action={mergeEventAction}
              eventId={eventId}
              reviewerDefault={reviewerDefault}
              submitLabel="Merge into target"
            >
              <p className="text-xs text-text-muted">
                Moves this event&apos;s sources to the target and takes this event off the site.
                Its public link redirects to the target.
              </p>
              <MergeTargetSelect
                targets={mergeTargets.filter((t) => t.review_status === "PUBLISHED")}
                defaultValue={defaultMergeTarget}
              />
            </ActionForm>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">
          This event is {reviewStatus === "MERGED" ? "merged away" : "rejected"}; there are no
          actions left for it.
        </p>
      )}
    </div>
  );
}
