"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import {
  approveEventAction,
  createExerciseFromEventAction,
  mergeEventAction,
  rejectEventAction,
  searchMergeTargetsAction,
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
import type { MergeTargetMatch } from "@/lib/review";

type MergeTarget = { event_id: string; headline: string; event_date: string; review_status: ReviewStatus };

/**
 * Search for the merge target by a phrase or a pasted excerpt (headline, summary and source
 * excerpts; close matches too), then pick one result. A target preselected from a "Possible
 * duplicate" link is shown first.
 */
function MergeTargetSearch({ eventId, preselected }: { eventId: string; preselected?: MergeTarget }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ query: string; matches: MergeTargetMatch[] } | null>(null);
  const [selected, setSelected] = useState(preselected?.event_id ?? "");
  const [pending, startTransition] = useTransition();
  const latest = useRef("");

  useEffect(() => {
    const q = query.trim();
    latest.current = q;
    if (q.length < 3) return;
    const timer = setTimeout(() => {
      startTransition(async () => {
        const matches = await searchMergeTargetsAction(eventId, q);
        if (latest.current === q) setResults({ query: q, matches });
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [query, eventId]);

  const q = query.trim();
  const matches = q.length >= 3 && results?.query === q ? results.matches : [];
  const shown =
    preselected && !matches.some((m) => m.event_id === preselected.event_id)
      ? [{ ...preselected, snippet: null }, ...matches]
      : matches;

  return (
    <div className="grid gap-2">
      <Label htmlFor="merge_search">Find the event to merge into</Label>
      <Input
        id="merge_search"
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Type a few words, or paste an excerpt from the article"
        autoComplete="off"
      />
      <p className="text-xs text-text-muted" aria-live="polite">
        {q.length > 0 && q.length < 3
          ? "Keep typing (at least 3 characters)."
          : pending
            ? "Searching…"
            : q.length >= 3 && results?.query === q
              ? `${matches.length === 0 ? "No" : matches.length} matching event${matches.length === 1 ? "" : "s"} (headlines, summaries and source excerpts).`
              : "Searches headlines, summaries and source excerpts, including close matches."}
      </p>
      {shown.length > 0 ? (
        <ul className="grid max-h-80 gap-1 overflow-y-auto" role="radiogroup" aria-label="Merge target">
          {shown.map((m) => (
            <li key={m.event_id}>
              <label
                className={`flex cursor-pointer items-start gap-2 border px-3 py-2 text-sm ${
                  selected === m.event_id ? "border-teal-blue bg-teal-blue/10" : "border-border hover:bg-surface-raised"
                }`}
              >
                <input
                  type="radio"
                  name="target_event_id"
                  value={m.event_id}
                  checked={selected === m.event_id}
                  onChange={() => setSelected(m.event_id)}
                  required
                  className="mt-1 size-4 accent-teal-blue"
                />
                <span className="grid gap-0.5">
                  <span className="font-medium">{m.headline}</span>
                  <span className="text-xs text-text-muted">
                    {m.event_date} · {m.review_status.replace("_", " ").toLowerCase()}
                  </span>
                  {m.snippet ? <span className="text-xs text-text-secondary">{m.snippet}</span> : null}
                </span>
              </label>
            </li>
          ))}
        </ul>
      ) : null}
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
  /** Exercise-type events link to (or create) an exercise record (decision 26). */
  isExerciseType?: boolean;
  linkedExerciseId?: string | null;
  /** The linked exercise's events report a newer status or observed dates than it has. */
  linkedExerciseHasSuggestion?: boolean;
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
  isExerciseType = false,
  linkedExerciseId = null,
  linkedExerciseHasSuggestion = false,
}: Props) {
  const canModerate =
    reviewStatus === "DRAFT" || reviewStatus === "PENDING_REVIEW";
  // From a "Possible duplicate" link: shown preselected in the merge search.
  const preselectedTarget = defaultMergeTarget
    ? mergeTargets.find((t) => t.event_id === defaultMergeTarget)
    : undefined;

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

      {isExerciseType ? (
        linkedExerciseId ? (
          <div className="grid gap-1 text-sm">
            <Link href={`/admin/exercises/${linkedExerciseId}/edit`} className="text-teal-blue hover:underline">
              Linked exercise: open it →
            </Link>
            {linkedExerciseHasSuggestion ? (
              <p className="border-l-2 border-teal-blue pl-3 text-xs text-foreground">
                Its linked events report a newer status or observed dates than the exercise has.{" "}
                <Link
                  href={`/admin/exercises/${linkedExerciseId}/edit#suggested`}
                  className="text-teal-blue hover:underline"
                >
                  Review the suggested update
                </Link>
              </p>
            ) : null}
          </div>
        ) : reviewStatus === "PUBLISHED" ? (
          <div className="max-w-xl">
            <ActionForm
              action={createExerciseFromEventAction}
              eventId={eventId}
              reviewerDefault={reviewerDefault}
              submitLabel="Create exercise from this event"
            >
              <p className="text-xs text-text-muted">
                Links this event to the exercise with the same name, or creates one from the
                event (name, status, country, dates, units, summary and sources) and opens it so
                you can check it. Approving an Exercise-type event does this automatically.
              </p>
            </ActionForm>
          </div>
        ) : (
          <p className="text-xs text-text-muted">
            Approving this Exercise-type event also links or creates its exercise.
          </p>
        )
      ) : null}

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
              <MergeTargetSearch eventId={eventId} preselected={preselectedTarget} />
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
              <MergeTargetSearch
                eventId={eventId}
                preselected={preselectedTarget?.review_status === "PUBLISHED" ? preselectedTarget : undefined}
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
