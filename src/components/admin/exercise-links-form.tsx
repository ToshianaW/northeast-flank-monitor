"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { ExerciseLinksState } from "@/app/admin/(console)/exercises/actions";
import { ReviewerField } from "@/components/admin/reviewer-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { REVIEW_STATUS_LABELS, type ReviewStatus } from "@/lib/event-labels";

type EventOption = {
  event_id: string;
  headline: string;
  event_date: string;
  review_status: ReviewStatus;
};

type Props = {
  action: (state: ExerciseLinksState, formData: FormData) => Promise<ExerciseLinksState>;
  linked: EventOption[];
  linkable: EventOption[];
  reviewerDefault?: string | null;
};

export function ExerciseLinksForm({ action, linked, linkable, reviewerDefault }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form
      action={formAction}
      className="grid max-w-4xl gap-4 border border-border bg-surface-dark p-4 sm:p-5"
    >
      <h2 className="text-sm font-semibold tracking-tight">Linked events</h2>
      {state.error ? (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.error}
        </p>
      ) : null}

      {linked.length === 0 ? (
        <p className="text-sm text-text-secondary">No events are linked yet.</p>
      ) : (
        <ul className="grid gap-2">
          {linked.map((event) => (
            <li key={event.event_id} className="flex flex-wrap items-center gap-3 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  name="unlink"
                  value={event.event_id}
                  className="size-4 accent-teal-blue"
                />
                <span className="sr-only">Unlink</span>
              </label>
              <span className="font-mono text-xs text-text-secondary">{event.event_date}</span>
              <Link
                href={`/admin/events/${event.event_id}/edit`}
                className="text-teal-blue hover:underline"
              >
                {event.headline}
              </Link>
              <span className="text-xs text-text-muted">
                {REVIEW_STATUS_LABELS[event.review_status]}
              </span>
            </li>
          ))}
        </ul>
      )}
      {linked.length > 0 ? (
        <p className="text-xs text-text-muted">Tick an event to unlink it.</p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="link">Link a published event</Label>
        <NativeSelect id="link" name="link" defaultValue="" className="w-full">
          <NativeSelectOption value="">None</NativeSelectOption>
          {linkable.map((event) => (
            <NativeSelectOption key={event.event_id} value={event.event_id}>
              {event.event_date} · {event.headline}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <p className="text-xs text-text-muted">
          Each link or unlink is logged as an edit on the event.
        </p>
      </div>

      <div className="max-w-md">
        <ReviewerField defaultValue={reviewerDefault} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Update linked events"}
        </Button>
      </div>
    </form>
  );
}
