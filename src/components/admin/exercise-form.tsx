"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { ExerciseFormState } from "@/app/admin/(console)/exercises/actions";
import { ReviewerField } from "@/components/admin/reviewer-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  DIMENSION_STATUS_LABELS,
  DIMENSION_STATUS_VALUES,
  EXERCISE_STATUS_LABELS,
  EXERCISE_STATUS_VALUES,
  RESET_STATUS_LABELS,
  RESET_STATUS_VALUES,
  REVIEW_STATUS_LABELS,
} from "@/lib/event-labels";
import { EXERCISE_REVIEW_STATUS_VALUES } from "@/lib/exercise-rules";
import type {
  ExerciseField,
  ExerciseFormValues,
  ExerciseSourceFormRow,
} from "@/lib/exercises";

type Props = {
  action: (state: ExerciseFormState, formData: FormData) => Promise<ExerciseFormState>;
  initialValues: ExerciseFormValues;
  initialSources: ExerciseSourceFormRow[];
  initialPrimaryIndex: number;
  sourceOptions: { id: string; name: string }[];
  submitLabel: string;
  reviewerDefault?: string | null;
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 border border-border bg-surface-dark p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold tracking-tight">{title}</legend>
      {children}
    </fieldset>
  );
}

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

const emptySourceRow = (): ExerciseSourceFormRow => ({
  source_id: "",
  article_url: "",
  excerpt: "",
});

const DIMENSIONS = [
  ["personnel_return_status", "Personnel"],
  ["equipment_return_status", "Equipment"],
  ["infrastructure_status", "Temporary infrastructure"],
] as const;

export function ExerciseForm({
  action,
  initialValues,
  initialSources,
  initialPrimaryIndex,
  sourceOptions,
  submitLabel,
  reviewerDefault,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initialValues;
  const errors = state.errors ?? {};

  const [rowCount, setRowCount] = useState(
    Math.max((state.sources ?? initialSources).length, 1),
  );
  const sourceRows = useMemo(() => {
    const fromState = state.sources ?? initialSources;
    return Array.from({ length: rowCount }, (_, i) => fromState[i] ?? emptySourceRow());
  }, [state.sources, initialSources, rowCount]);
  const primaryIndex = state.primaryIndex ?? initialPrimaryIndex;

  const fieldProps = (name: ExerciseField) => ({
    id: name,
    name,
    defaultValue: values[name],
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });
  const sourceError = (index: number, field: string) =>
    errors[`xs_${index}_${field}` as keyof typeof errors];

  const textField = (name: ExerciseField, label: string, extra?: React.ReactNode) => (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input {...fieldProps(name)} />
      {extra}
      <FieldError id={`${name}-error`} message={errors[name]} />
    </div>
  );
  const dateField = (name: ExerciseField, label: string) => (
    <div className="grid gap-2">
      <Label htmlFor={name}>{label}</Label>
      <Input {...fieldProps(name)} type="date" />
      <FieldError id={`${name}-error`} message={errors[name]} />
    </div>
  );

  return (
    <form
      // Rebuilt only when the server returns (to show the values it sent back). Not on "Add
      // another source": that would reset everything typed so far.
      key={JSON.stringify(state)}
      action={formAction}
      className="grid max-w-4xl gap-6"
      noValidate
    >
      {state.formError ? (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.formError}
        </p>
      ) : null}

      <Section title="Basics">
        {textField("exercise_name", "Exercise name")}
        <div className="grid gap-2">
          <Label htmlFor="summary">Summary</Label>
          <Textarea {...fieldProps("summary")} rows={4} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="exercise_status">Exercise status</Label>
            <NativeSelect {...fieldProps("exercise_status")} className="w-full">
              {EXERCISE_STATUS_VALUES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {EXERCISE_STATUS_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-xs text-text-muted">
              Set by hand. It never changes when a date passes.
            </p>
            <FieldError id="exercise_status-error" message={errors.exercise_status} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="review_status">Review status</Label>
            <NativeSelect {...fieldProps("review_status")} className="w-full">
              {EXERCISE_REVIEW_STATUS_VALUES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {REVIEW_STATUS_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <p className="text-xs text-text-muted">
              Only Published exercises appear on the public site.
            </p>
            <FieldError id="review_status-error" message={errors.review_status} />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {textField("actor", "Actor")}
          {textField(
            "countries",
            "Countries",
            <p className="text-xs text-text-muted">Separate with commas.</p>,
          )}
        </div>
        {textField("location", "Location")}
        <div className="grid gap-2">
          <Label htmlFor="exercise_objectives">Objectives</Label>
          <Textarea {...fieldProps("exercise_objectives")} rows={3} />
        </div>
      </Section>

      <Section title="Forces">
        <div className="grid gap-2">
          <Label htmlFor="participating_units">Participating units</Label>
          <Textarea {...fieldProps("participating_units")} rows={2} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          {textField("estimated_personnel", "Estimated personnel")}
          {textField("equipment", "Equipment")}
        </div>
      </Section>

      <Section title="Dates">
        <div className="grid gap-5 sm:grid-cols-2">
          {dateField("announced_start_date", "Announced start")}
          {dateField("observed_start_date", "Observed start")}
          {dateField("announced_end_date", "Announced end")}
          {dateField("observed_end_date", "Observed end")}
        </div>
      </Section>

      <Section title="Post-exercise reset">
        <p className="text-sm text-text-secondary">
          Anything other than Unknown needs evidence: a source below with an excerpt, or a
          linked published event dated on or after the end date (observed end, or announced
          end if none is observed).
        </p>
        <div className="grid gap-5 sm:grid-cols-3">
          {DIMENSIONS.map(([name, label]) => (
            <div key={name} className="grid gap-2">
              <Label htmlFor={name}>{label}</Label>
              <NativeSelect {...fieldProps(name)} className="w-full">
                {DIMENSION_STATUS_VALUES.map((value) => (
                  <NativeSelectOption key={value} value={value}>
                    {DIMENSION_STATUS_LABELS[value]}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              <FieldError id={`${name}-error`} message={errors[name]} />
            </div>
          ))}
        </div>
        <div className="grid gap-2">
          <Label htmlFor="post_exercise_reset">Overall reset status</Label>
          <NativeSelect {...fieldProps("post_exercise_reset")} className="max-w-md">
            {RESET_STATUS_VALUES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {RESET_STATUS_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="post_exercise_reset-error" message={errors.post_exercise_reset} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="follow_on_activity">Follow-on activity</Label>
          <Textarea {...fieldProps("follow_on_activity")} rows={2} />
        </div>
      </Section>

      <Section title="Attached sources">
        <p className="text-sm text-text-secondary">
          Mark one primary. Leave a row empty to skip it. A published exercise needs at
          least one source.
        </p>
        <FieldError id="xs_0_source_id-error" message={sourceError(0, "source_id")} />
        <div className="grid gap-4">
          {sourceRows.map((row, index) => (
            <div key={index} className="grid gap-3 border border-border/80 bg-surface-raised p-3">
              <p className="text-xs font-medium text-text-muted">Source {index + 1}</p>
              <div className="grid gap-2">
                <Label htmlFor={`xs_${index}_source_id`}>Registry source</Label>
                <NativeSelect
                  id={`xs_${index}_source_id`}
                  name={`xs_${index}_source_id`}
                  defaultValue={row.source_id}
                  className="w-full"
                >
                  <NativeSelectOption value="">Choose…</NativeSelectOption>
                  {sourceOptions.map((source) => (
                    <NativeSelectOption key={source.id} value={source.id}>
                      {source.name}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                {index > 0 ? (
                  <FieldError
                    id={`xs_${index}_source_id-error`}
                    message={sourceError(index, "source_id")}
                  />
                ) : null}
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`xs_${index}_article_url`}>Article URL</Label>
                <Input
                  id={`xs_${index}_article_url`}
                  name={`xs_${index}_article_url`}
                  type="url"
                  defaultValue={row.article_url}
                  placeholder="https://"
                />
                <FieldError
                  id={`xs_${index}_article_url-error`}
                  message={sourceError(index, "article_url")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`xs_${index}_excerpt`}>Excerpt</Label>
                <Textarea
                  id={`xs_${index}_excerpt`}
                  name={`xs_${index}_excerpt`}
                  rows={2}
                  defaultValue={row.excerpt}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="xs_primary_index"
                  value={String(index)}
                  defaultChecked={index === primaryIndex}
                  className="size-4 accent-teal-blue"
                />
                Primary source for this exercise
              </label>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setRowCount((count) => count + 1)}
          >
            Add another source
          </Button>
          {rowCount > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setRowCount((count) => Math.max(1, count - 1))}
            >
              Remove last row
            </Button>
          ) : null}
        </div>
      </Section>

      <div className="max-w-md">
        <ReviewerField defaultValue={state.reviewer ?? reviewerDefault} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link href="/admin/exercises" className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
