"use client";

import { useActionState } from "react";
import {
  approveHistoricalAction,
  rejectHistoricalAction,
  unpublishHistoricalAction,
  type HistoricalActionState,
} from "@/app/admin/(console)/historical/actions";
import { ReviewerField } from "@/components/admin/reviewer-field";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  CONFIDENCE_LEVEL_LABELS,
  CONFIDENCE_LEVEL_VALUES,
  type ConfidenceLevel,
} from "@/lib/event-labels";
import type { HistoricalStatus } from "@/lib/historical-rules";

type Action = (id: string, state: HistoricalActionState, formData: FormData) => Promise<HistoricalActionState>;

function ActionForm({
  action,
  eventId,
  reviewerDefault,
  submitLabel,
  variant = "default",
  children,
}: {
  action: Action;
  eventId: string;
  reviewerDefault: string | null;
  submitLabel: string;
  variant?: "default" | "outline";
  children?: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action.bind(null, eventId), {});
  return (
    <form action={formAction} className="grid gap-3 border border-border p-4">
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      <ReviewerField defaultValue={reviewerDefault} />
      {children}
      <Button type="submit" size="sm" variant={variant} disabled={pending}>
        {pending ? "Working…" : submitLabel}
      </Button>
    </form>
  );
}

export function HistoricalReviewActions({
  eventId,
  status,
  confidenceLevel,
  reviewerDefault,
}: {
  eventId: string;
  status: HistoricalStatus;
  confidenceLevel: ConfidenceLevel;
  reviewerDefault: string | null;
}) {
  if (status === "REJECTED") {
    return <p className="text-sm text-text-secondary">Rejected. Edit it to keep a record, or leave it out of the dataset.</p>;
  }
  if (status === "PUBLISHED") {
    return (
      <ActionForm action={unpublishHistoricalAction} eventId={eventId} reviewerDefault={reviewerDefault} submitLabel="Unpublish (back to queue)" variant="outline">
        <div className="grid gap-2">
          <Label htmlFor="unpublish-reason">Reason (optional)</Label>
          <Input id="unpublish-reason" name="reason" maxLength={500} />
        </div>
      </ActionForm>
    );
  }
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <ActionForm action={approveHistoricalAction} eventId={eventId} reviewerDefault={reviewerDefault} submitLabel="Approve and publish">
        <div className="grid gap-2">
          <Label htmlFor="confidence_level">Confidence</Label>
          <NativeSelect id="confidence_level" name="confidence_level" defaultValue={confidenceLevel} className="w-full">
            {CONFIDENCE_LEVEL_VALUES.map((v) => (
              <NativeSelectOption key={v} value={v}>
                {CONFIDENCE_LEVEL_LABELS[v]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      </ActionForm>
      <ActionForm action={rejectHistoricalAction} eventId={eventId} reviewerDefault={reviewerDefault} submitLabel="Reject" variant="outline">
        <div className="grid gap-2">
          <Label htmlFor="reject-reason">Reason (optional)</Label>
          <Input id="reject-reason" name="reason" maxLength={500} />
        </div>
      </ActionForm>
    </div>
  );
}
