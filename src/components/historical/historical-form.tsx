"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { HistoricalFormState } from "@/app/admin/(console)/historical/actions";
import { ReviewerField } from "@/components/admin/reviewer-field";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFIDENCE_LEVEL_LABELS,
  DIMENSION_STATUS_LABELS,
  EVENT_TYPE_LABELS,
  EXERCISE_STATUS_LABELS,
  LOCATION_PRECISION_LABELS,
  RESET_STATUS_LABELS,
  SOURCE_RELATIONSHIP_LABELS,
  SOURCE_RELATIONSHIP_VALUES,
} from "@/lib/event-labels";
import {
  excerptWordCount,
  HISTORICAL_FIELDS,
  HISTORICAL_FIRST_DAY,
  HISTORICAL_LAST_DAY,
  MAX_EXCERPT_WORDS,
  PHASE_TAG_LABELS,
  type HistoricalField,
} from "@/lib/historical-rules";
import type { HistoricalFormValues, HistoricalSourceFormRow } from "@/lib/historical";

export type HistoricalSourceOption = { id: string; label: string };

type Props = {
  action: (state: HistoricalFormState, formData: FormData) => Promise<HistoricalFormState>;
  initialValues: HistoricalFormValues;
  initialSources: HistoricalSourceFormRow[];
  initialPrimaryIndex: number;
  sourceOptions: HistoricalSourceOption[];
  reviewerDefault: string | null;
  submitLabel: string;
  cancelHref: string;
};

const ENUM_LABELS: Partial<Record<HistoricalField, Record<string, string>>> = {
  event_type: EVENT_TYPE_LABELS,
  location_precision: LOCATION_PRECISION_LABELS,
  exercise_status: EXERCISE_STATUS_LABELS,
  personnel_return_status: DIMENSION_STATUS_LABELS,
  equipment_return_status: DIMENSION_STATUS_LABELS,
  infrastructure_status: DIMENSION_STATUS_LABELS,
  overall_reset_status: RESET_STATUS_LABELS,
  confidence_level: CONFIDENCE_LEVEL_LABELS,
  phase_tag: PHASE_TAG_LABELS,
};

const FIELD_LABELS: Partial<Record<HistoricalField, string>> = {
  phase_tag: "Phase tag (admin only)",
  internal_notes: "Internal notes (admin only)",
  confidence_level: "Confidence",
};

const SECTIONS: Array<{ title: string; fields: HistoricalField[] }> = [
  { title: "Basics", fields: ["headline", "summary", "event_date", "reported_date", "event_type", "event_subtype", "confidence_level"] },
  { title: "Where and who", fields: ["actor", "country", "region", "location_name", "location_precision", "unit_name", "unit_type", "unit_home_location", "personnel_estimate", "equipment_type", "equipment_quantity", "activity_description"] },
  { title: "Exercise and reset", fields: ["exercise_name", "exercise_status", "announced_start_date", "announced_end_date", "observed_start_date", "observed_end_date", "personnel_return_status", "equipment_return_status", "infrastructure_status", "overall_reset_status", "follow_on_activity"] },
  { title: "Review notes", fields: ["contradiction_notes", "phase_tag", "internal_notes"] },
];

const emptyRow = (): HistoricalSourceFormRow => ({
  source_id: "",
  article_url: "",
  archived_url: "",
  accessed_at: "",
  relationship: "SUPPORTS",
  excerpt: "",
});

function labelFor(field: HistoricalField): string {
  const text = FIELD_LABELS[field] ?? field.replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="grid gap-4 border border-border bg-surface-dark p-4 sm:p-5">
      <legend className="px-1 text-sm font-semibold tracking-tight">{title}</legend>
      {children}
    </fieldset>
  );
}

function FieldError({ message, id }: { message?: string; id: string }) {
  return message ? (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  ) : null;
}

function ExcerptInput({ name, defaultValue, error }: { name: string; defaultValue: string; error?: string }) {
  const [words, setWords] = useState(excerptWordCount(defaultValue));
  return (
    <div className="grid gap-2">
      <Label htmlFor={name}>Excerpt (quoted, {MAX_EXCERPT_WORDS} words or fewer)</Label>
      <Textarea
        id={name}
        name={name}
        rows={2}
        defaultValue={defaultValue}
        onChange={(e) => setWords(excerptWordCount(e.target.value))}
        aria-invalid={error ? true : undefined}
      />
      <p className={`text-xs ${words > MAX_EXCERPT_WORDS ? "text-destructive" : "text-text-muted"}`}>
        {words} / {MAX_EXCERPT_WORDS} words
      </p>
      <FieldError id={`${name}-error`} message={error} />
    </div>
  );
}

export function HistoricalForm({
  action,
  initialValues,
  initialSources,
  initialPrimaryIndex,
  sourceOptions,
  reviewerDefault,
  submitLabel,
  cancelHref,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initialValues;
  const errors = state.errors ?? {};
  const [rowCount, setRowCount] = useState(Math.max((state.sources ?? initialSources).length, 1));
  const rows = useMemo(() => {
    const from = state.sources ?? initialSources;
    return Array.from({ length: rowCount }, (_, i) => from[i] ?? emptyRow());
  }, [state.sources, initialSources, rowCount]);
  const primaryIndex = state.primaryIndex ?? initialPrimaryIndex;

  const renderField = (field: HistoricalField) => {
    const spec: { kind: string; values?: readonly string[]; required?: boolean } = HISTORICAL_FIELDS[field];
    const common = {
      id: field,
      name: field,
      defaultValue: values[field],
      "aria-invalid": errors[field] ? true : undefined,
      "aria-describedby": errors[field] ? `${field}-error` : undefined,
    };
    let input: React.ReactNode;
    if (spec.kind === "textarea") input = <Textarea {...common} rows={3} />;
    else if (spec.kind === "date") {
      input =
        field === "event_date" ? (
          <Input {...common} type="date" min={HISTORICAL_FIRST_DAY} max={HISTORICAL_LAST_DAY} required />
        ) : (
          <Input {...common} type="date" />
        );
    } else if (spec.kind === "enum") {
      const labels = ENUM_LABELS[field] ?? {};
      input = (
        <NativeSelect {...common} className="w-full">
          {spec.required ? null : <NativeSelectOption value="">Not set</NativeSelectOption>}
          {spec.values!.map((v) => (
            <NativeSelectOption key={v} value={v}>
              {labels[v] ?? v}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      );
    } else input = <Input {...common} required={spec.required} maxLength={field === "headline" ? 500 : undefined} />;

    return (
      <div key={field} className={`grid gap-2 ${spec.kind === "textarea" || field === "headline" ? "sm:col-span-2" : ""}`}>
        <Label htmlFor={field}>{labelFor(field)}</Label>
        {input}
        <FieldError id={`${field}-error`} message={errors[field]} />
      </div>
    );
  };

  return (
    <form
      key={JSON.stringify({ values, rows, primaryIndex, rowCount })}
      action={formAction}
      className="grid max-w-4xl gap-6"
      noValidate
    >
      {state.formError ? (
        <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.formError}
        </p>
      ) : null}

      {SECTIONS.map((section) => (
        <Section key={section.title} title={section.title}>
          <div className="grid gap-5 sm:grid-cols-2">{section.fields.map(renderField)}</div>
          {section.title === "Review notes" ? (
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="contradiction_flag"
                defaultChecked={values.contradiction_flag === "on"}
                className="size-4 accent-teal-blue"
              />
              Sources conflict (contradiction flag)
            </label>
          ) : null}
        </Section>
      ))}

      <Section title="Sources">
        <p className="text-sm text-text-secondary">
          Registry sources only. Each needs the article link, the date you read it, and a short quoted excerpt.
          Mark one supporting source as primary. Publishing needs a supporting Tier 1–3 source.
        </p>
        <FieldError id="hs_0_source_id-error" message={errors.hs_0_source_id} />
        {rows.map((row, i) => (
          <div key={i} className="grid gap-3 border border-border/80 bg-surface-raised p-3">
            <p className="text-xs font-medium text-text-muted">Source {i + 1}</p>
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid gap-2">
                <Label htmlFor={`hs_${i}_source_id`}>Registry source</Label>
                <NativeSelect id={`hs_${i}_source_id`} name={`hs_${i}_source_id`} defaultValue={row.source_id} className="w-full">
                  <NativeSelectOption value="">Choose…</NativeSelectOption>
                  {sourceOptions.map((s) => (
                    <NativeSelectOption key={s.id} value={s.id}>
                      {s.label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError id={`hs_${i}_source_id-error`} message={i === 0 ? undefined : errors[`hs_${i}_source_id`]} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`hs_${i}_relationship`}>Relationship</Label>
                <NativeSelect id={`hs_${i}_relationship`} name={`hs_${i}_relationship`} defaultValue={row.relationship} className="w-full">
                  {SOURCE_RELATIONSHIP_VALUES.map((v) => (
                    <NativeSelectOption key={v} value={v}>
                      {SOURCE_RELATIONSHIP_LABELS[v]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
                <FieldError id={`hs_${i}_relationship-error`} message={errors[`hs_${i}_relationship`]} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`hs_${i}_article_url`}>Article URL</Label>
                <Input id={`hs_${i}_article_url`} name={`hs_${i}_article_url`} type="url" defaultValue={row.article_url} placeholder="https://" />
                <FieldError id={`hs_${i}_article_url-error`} message={errors[`hs_${i}_article_url`]} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`hs_${i}_archived_url`}>Archived copy URL (optional)</Label>
                <Input id={`hs_${i}_archived_url`} name={`hs_${i}_archived_url`} type="url" defaultValue={row.archived_url} placeholder="https://web.archive.org/…" />
                <FieldError id={`hs_${i}_archived_url-error`} message={errors[`hs_${i}_archived_url`]} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`hs_${i}_accessed_at`}>Date read</Label>
                <Input id={`hs_${i}_accessed_at`} name={`hs_${i}_accessed_at`} type="date" defaultValue={row.accessed_at} />
                <FieldError id={`hs_${i}_accessed_at-error`} message={errors[`hs_${i}_accessed_at`]} />
              </div>
            </div>
            <ExcerptInput name={`hs_${i}_excerpt`} defaultValue={row.excerpt} error={errors[`hs_${i}_excerpt`]} />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="hs_primary_index"
                value={String(i)}
                defaultChecked={i === primaryIndex}
                className="size-4 accent-teal-blue"
              />
              Primary source
            </label>
          </div>
        ))}
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setRowCount((n) => n + 1)}>
            Add another source
          </Button>
          {rowCount > 1 ? (
            <Button type="button" variant="ghost" size="sm" onClick={() => setRowCount((n) => Math.max(1, n - 1))}>
              Remove last row
            </Button>
          ) : null}
        </div>
      </Section>

      <div className="max-w-md">
        <ReviewerField defaultValue={state.reviewer ?? reviewerDefault} error={errors.reviewer} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
