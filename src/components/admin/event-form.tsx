"use client";

import Link from "next/link";
import { useActionState, useMemo, useState } from "react";
import type { EventFormState } from "@/app/admin/(console)/events/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  CONFIDENCE_LEVEL_LABELS,
  CONFIDENCE_LEVEL_VALUES,
  DIMENSION_STATUS_LABELS,
  DIMENSION_STATUS_VALUES,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VALUES,
  EXERCISE_STATUS_LABELS,
  EXERCISE_STATUS_VALUES,
  LOCATION_PRECISION_LABELS,
  LOCATION_PRECISION_VALUES,
  RESET_STATUS_LABELS,
  RESET_STATUS_VALUES,
  REVIEW_STATUS_LABELS,
  SOURCE_RELATIONSHIP_LABELS,
  SOURCE_RELATIONSHIP_VALUES,
} from "@/lib/event-labels";
import type { EventField, EventFormValues, EventSourceFormRow } from "@/lib/events";
import { COUNTRY_SUGGESTIONS } from "@/lib/source-labels";

type SourceOption = { id: string; name: string };
type ExerciseOption = { id: string; exercise_name: string };

type Props = {
  action: (
    state: EventFormState,
    formData: FormData,
  ) => Promise<EventFormState>;
  initialValues: EventFormValues;
  initialSources: EventSourceFormRow[];
  initialPrimaryIndex: number;
  sourceOptions: SourceOption[];
  exerciseOptions: ExerciseOption[];
  submitLabel: string;
  isEdit?: boolean;
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

const emptySourceRow = (): EventSourceFormRow => ({
  source_id: "",
  article_url: "",
  relationship: "SUPPORTS",
  excerpt: "",
});

export function EventForm({
  action,
  initialValues,
  initialSources,
  initialPrimaryIndex,
  sourceOptions,
  exerciseOptions,
  submitLabel,
  isEdit = false,
}: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initialValues;
  const errors = state.errors ?? {};

  const initialRowCount = Math.max(
    (state.sources ?? initialSources).length,
    1,
  );
  const [rowCount, setRowCount] = useState(initialRowCount);

  const sourceRows = useMemo(() => {
    const fromState = state.sources ?? initialSources;
    const rows: EventSourceFormRow[] = [];
    for (let i = 0; i < rowCount; i++) {
      rows.push(fromState[i] ?? emptySourceRow());
    }
    return rows;
  }, [state.sources, initialSources, rowCount]);

  const primaryIndex = state.primaryIndex ?? initialPrimaryIndex;

  const fieldProps = (name: EventField) => ({
    id: name,
    name,
    defaultValue: values[name],
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  const sourceError = (index: number, field: string) =>
    errors[`es_${index}_${field}` as keyof typeof errors];

  return (
    <form
      key={JSON.stringify({ values, sourceRows, primaryIndex, rowCount })}
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
        <div className="grid gap-2">
          <Label htmlFor="headline">Headline</Label>
          <Input {...fieldProps("headline")} required maxLength={500} />
          <FieldError id="headline-error" message={errors.headline} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="summary">Summary</Label>
          <Textarea {...fieldProps("summary")} rows={4} />
          <FieldError id="summary-error" message={errors.summary} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="event_date">Event date</Label>
            <Input {...fieldProps("event_date")} type="date" required />
            <FieldError id="event_date-error" message={errors.event_date} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="reported_date">Reported date</Label>
            <Input {...fieldProps("reported_date")} type="date" />
            <FieldError id="reported_date-error" message={errors.reported_date} />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="event_type">Event type</Label>
            <NativeSelect {...fieldProps("event_type")} className="w-full">
              {EVENT_TYPE_VALUES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {EVENT_TYPE_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError id="event_type-error" message={errors.event_type} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="event_subtype">Event subtype</Label>
            <Input {...fieldProps("event_subtype")} />
            <FieldError id="event_subtype-error" message={errors.event_subtype} />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="actor">Actor</Label>
            <Input {...fieldProps("actor")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="country">Country</Label>
            <Input {...fieldProps("country")} list="event-country-suggestions" />
            <datalist id="event-country-suggestions">
              {COUNTRY_SUGGESTIONS.map((country) => (
                <option key={country} value={country} />
              ))}
            </datalist>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="region">Region</Label>
            <Input {...fieldProps("region")} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="confidence_level">Confidence level</Label>
          <NativeSelect {...fieldProps("confidence_level")} className="max-w-md">
            {CONFIDENCE_LEVEL_VALUES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {CONFIDENCE_LEVEL_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="confidence_level-error" message={errors.confidence_level} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="activity_description">Activity description</Label>
          <Textarea {...fieldProps("activity_description")} rows={3} />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid gap-1 text-sm">
            <span className="text-text-secondary">Human reviewed</span>
            <p className="font-medium">
              {values.human_reviewed === "true" ? "Yes" : "No"}
            </p>
            <p className="text-xs text-text-muted">
              Set when an event is approved (step 1.5).
            </p>
            <input
              type="hidden"
              name="human_reviewed"
              value={values.human_reviewed === "true" ? "true" : ""}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="contradiction_flag"
              defaultChecked={values.contradiction_flag === "true"}
              className="size-4 accent-teal-blue"
            />
            Contradiction flag
          </label>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="contradiction_notes">Contradiction notes</Label>
          <Textarea {...fieldProps("contradiction_notes")} rows={2} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="review_status">Review status</Label>
          <Input
            id="review_status"
            name="review_status"
            defaultValue={values.review_status}
            readOnly
            className="max-w-md bg-surface-raised text-text-secondary"
          />
          <p className="text-xs text-text-muted">
            New events save as DRAFT. Publish and approve flows are step 1.5.
          </p>
          {isEdit ? (
            <p className="text-xs text-text-muted">
              Current status: {REVIEW_STATUS_LABELS[values.review_status as keyof typeof REVIEW_STATUS_LABELS] ?? values.review_status}
            </p>
          ) : null}
        </div>
      </Section>

      <Section title="Location">
        <div className="grid gap-2">
          <Label htmlFor="location_name">Location name</Label>
          <Input {...fieldProps("location_name")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="location_precision">Location precision</Label>
          <NativeSelect {...fieldProps("location_precision")} className="max-w-md">
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {LOCATION_PRECISION_VALUES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {LOCATION_PRECISION_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="location_precision-error" message={errors.location_precision} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="latitude">Latitude</Label>
            <Input {...fieldProps("latitude")} inputMode="decimal" placeholder="e.g. 54.6872" />
            <FieldError id="latitude-error" message={errors.latitude} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="longitude">Longitude</Label>
            <Input {...fieldProps("longitude")} inputMode="decimal" placeholder="e.g. 25.2797" />
            <FieldError id="longitude-error" message={errors.longitude} />
          </div>
        </div>
      </Section>

      <Section title="Exercise link">
        <div className="grid gap-2">
          <Label htmlFor="exercise_id">Linked exercise</Label>
          <NativeSelect {...fieldProps("exercise_id")} className="w-full">
            <NativeSelectOption value="">None</NativeSelectOption>
            {exerciseOptions.map((ex) => (
              <NativeSelectOption key={ex.id} value={ex.id}>
                {ex.exercise_name}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="exercise_id-error" message={errors.exercise_id} />
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="exercise_name">Exercise name (on event)</Label>
            <Input {...fieldProps("exercise_name")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="exercise_status">Exercise status</Label>
            <NativeSelect {...fieldProps("exercise_status")} className="w-full">
              <NativeSelectOption value="">Not set</NativeSelectOption>
              {EXERCISE_STATUS_VALUES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {EXERCISE_STATUS_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError id="exercise_status-error" message={errors.exercise_status} />
          </div>
        </div>
      </Section>

      <Section title="Units and equipment">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="unit_name">Unit name</Label>
            <Input {...fieldProps("unit_name")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="unit_type">Unit type</Label>
            <Input {...fieldProps("unit_type")} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="unit_home_location">Unit home location</Label>
          <Input {...fieldProps("unit_home_location")} />
        </div>
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="personnel_estimate">Personnel estimate</Label>
            <Input {...fieldProps("personnel_estimate")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="equipment_type">Equipment type</Label>
            <Input {...fieldProps("equipment_type")} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="equipment_quantity">Equipment quantity</Label>
            <Input {...fieldProps("equipment_quantity")} />
          </div>
        </div>
      </Section>

      <Section title="Dates">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="first_reported">First reported</Label>
            <Input {...fieldProps("first_reported")} type="datetime-local" />
            <FieldError id="first_reported-error" message={errors.first_reported} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="last_updated">Last updated</Label>
            <Input {...fieldProps("last_updated")} type="datetime-local" />
            <FieldError id="last_updated-error" message={errors.last_updated} />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="announced_start_date">Announced start</Label>
            <Input {...fieldProps("announced_start_date")} type="date" />
            <FieldError id="announced_start_date-error" message={errors.announced_start_date} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="announced_end_date">Announced end</Label>
            <Input {...fieldProps("announced_end_date")} type="date" />
            <FieldError id="announced_end_date-error" message={errors.announced_end_date} />
          </div>
        </div>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="grid gap-2">
            <Label htmlFor="observed_start_date">Observed start</Label>
            <Input {...fieldProps("observed_start_date")} type="date" />
            <FieldError id="observed_start_date-error" message={errors.observed_start_date} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="observed_end_date">Observed end</Label>
            <Input {...fieldProps("observed_end_date")} type="date" />
            <FieldError id="observed_end_date-error" message={errors.observed_end_date} />
          </div>
        </div>
      </Section>

      <Section title="Reset dimensions">
        <div className="grid gap-5 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="personnel_return_status">Personnel return</Label>
            <NativeSelect {...fieldProps("personnel_return_status")} className="w-full">
              <NativeSelectOption value="">Not set</NativeSelectOption>
              {DIMENSION_STATUS_VALUES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {DIMENSION_STATUS_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError id="personnel_return_status-error" message={errors.personnel_return_status} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="equipment_return_status">Equipment return</Label>
            <NativeSelect {...fieldProps("equipment_return_status")} className="w-full">
              <NativeSelectOption value="">Not set</NativeSelectOption>
              {DIMENSION_STATUS_VALUES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {DIMENSION_STATUS_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError id="equipment_return_status-error" message={errors.equipment_return_status} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="infrastructure_status">Infrastructure</Label>
            <NativeSelect {...fieldProps("infrastructure_status")} className="w-full">
              <NativeSelectOption value="">Not set</NativeSelectOption>
              {DIMENSION_STATUS_VALUES.map((value) => (
                <NativeSelectOption key={value} value={value}>
                  {DIMENSION_STATUS_LABELS[value]}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <FieldError id="infrastructure_status-error" message={errors.infrastructure_status} />
          </div>
        </div>
        <div className="grid gap-2">
          <Label htmlFor="overall_reset_status">Overall reset status</Label>
          <NativeSelect {...fieldProps("overall_reset_status")} className="w-full">
            <NativeSelectOption value="">Not set</NativeSelectOption>
            {RESET_STATUS_VALUES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {RESET_STATUS_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="overall_reset_status-error" message={errors.overall_reset_status} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="follow_on_activity">Follow-on activity</Label>
          <Textarea {...fieldProps("follow_on_activity")} rows={2} />
        </div>
      </Section>

      <Section title="Historical and AI notes">
        <div className="grid gap-2">
          <Label htmlFor="historical_analogue">Historical analogue</Label>
          <Input {...fieldProps("historical_analogue")} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="historical_notes">Historical notes</Label>
          <Textarea {...fieldProps("historical_notes")} rows={3} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="ai_generated_summary">AI-generated summary</Label>
          <Textarea {...fieldProps("ai_generated_summary")} rows={3} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="internal_notes">Internal notes</Label>
          <Textarea {...fieldProps("internal_notes")} rows={3} />
          <p className="text-xs text-text-muted">
            Reviewer-only. Never shown on the public site.
          </p>
        </div>
        <p className="text-xs text-text-muted">
          Source name, URL, type, country, language, and reliability on the event
          row are filled from the primary attached source when you save — not
          edited here.
        </p>
      </Section>

      <Section title="Attached sources">
        <p className="text-sm text-text-secondary">
          Link registry sources to this event. Mark one primary; it must SUPPORT,
          not CONTRADICT.
        </p>
        <FieldError id="es_0_source_id-error" message={sourceError(0, "source_id")} />

        <div className="grid gap-4">
          {sourceRows.map((row, index) => (
            <div
              key={index}
              className="grid gap-3 border border-border/80 bg-surface-raised p-3"
            >
              <p className="text-xs font-medium text-text-muted">Source {index + 1}</p>
              <div className="grid gap-5 sm:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor={`es_${index}_source_id`}>Registry source</Label>
                  <NativeSelect
                    id={`es_${index}_source_id`}
                    name={`es_${index}_source_id`}
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
                  <FieldError
                    id={`es_${index}_source_id-error`}
                    message={sourceError(index, "source_id")}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor={`es_${index}_relationship`}>Relationship</Label>
                  <NativeSelect
                    id={`es_${index}_relationship`}
                    name={`es_${index}_relationship`}
                    defaultValue={row.relationship}
                    className="w-full"
                  >
                    {SOURCE_RELATIONSHIP_VALUES.map((value) => (
                      <NativeSelectOption key={value} value={value}>
                        {SOURCE_RELATIONSHIP_LABELS[value]}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                  <FieldError
                    id={`es_${index}_relationship-error`}
                    message={sourceError(index, "relationship")}
                  />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`es_${index}_article_url`}>Article URL</Label>
                <Input
                  id={`es_${index}_article_url`}
                  name={`es_${index}_article_url`}
                  type="url"
                  defaultValue={row.article_url}
                  placeholder="https://"
                />
                <FieldError
                  id={`es_${index}_article_url-error`}
                  message={sourceError(index, "article_url")}
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`es_${index}_excerpt`}>Excerpt</Label>
                <Textarea
                  id={`es_${index}_excerpt`}
                  name={`es_${index}_excerpt`}
                  rows={2}
                  defaultValue={row.excerpt}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="es_primary_index"
                  value={String(index)}
                  defaultChecked={index === primaryIndex}
                  className="size-4 accent-teal-blue"
                />
                Primary source for this event
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

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link href="/admin/events" className={buttonVariants({ variant: "ghost" })}>
          Cancel
        </Link>
      </div>
    </form>
  );
}
