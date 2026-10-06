"use client";

import { useActionState } from "react";
import type { DismissSuggestionState } from "@/app/admin/(console)/exercises/actions";
import { ReviewerField } from "@/components/admin/reviewer-field";
import { Button } from "@/components/ui/button";

type Props = {
  action: (state: DismissSuggestionState, formData: FormData) => Promise<DismissSuggestionState>;
  reviewerDefault?: string | null;
};

/** Dismisses the suggested update on the exercise edit page; the reviewer's name is logged. */
export function DismissSuggestionForm({ action, reviewerDefault }: Props) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <details className="mt-3 text-sm">
      <summary className="cursor-pointer text-xs text-text-muted hover:text-foreground">
        Not right? Dismiss this suggestion
      </summary>
      <form action={formAction} className="mt-3 grid max-w-md gap-3">
        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}
        <p className="text-xs text-text-muted">
          The exercise stays as it is and the flag is cleared. It comes back if the linked events
          later report something different.
        </p>
        <ReviewerField defaultValue={reviewerDefault ?? null} />
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {pending ? "Working…" : "Dismiss suggestion"}
        </Button>
      </form>
    </details>
  );
}
