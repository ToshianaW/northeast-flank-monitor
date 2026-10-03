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

type MergeTarget = { event_id: string; headline: string; event_date: string };

type Props = {
  eventId: string;
  reviewStatus: ReviewStatus;
  confidenceLevel: ConfidenceLevel;
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

/** Confidence must be chosen at approval; prefilled with the event's current value. */
function ConfidenceField({ defaultValue }: { defaultValue: ConfidenceLevel }) {
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
            <ConfidenceField defaultValue={confidenceLevel} />
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
              <div className="grid gap-2">
                <Label htmlFor="target_event_id">Target event</Label>
                <NativeSelect
                  key={defaultMergeTarget ?? ""}
                  id="target_event_id"
                  name="target_event_id"
                  required
                  defaultValue={defaultMergeTarget ?? ""}
                  className="w-full"
                >
                  <NativeSelectOption value="">Choose…</NativeSelectOption>
                  {mergeTargets.map((target) => (
                    <NativeSelectOption key={target.event_id} value={target.event_id}>
                      {target.event_date} — {target.headline}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </div>
            </ActionForm>
          </div>
        </div>
      ) : (
        <p className="text-sm text-text-secondary">
          Approve, reject, and merge are only available for draft or pending events.
        </p>
      )}
    </div>
  );
}
