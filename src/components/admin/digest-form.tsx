"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { DigestFormState } from "@/app/admin/(console)/digests/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import type {
  DigestField,
  DigestFormValues,
  DigestSectionKey,
} from "@/lib/digests";

type Props = {
  action: (
    state: DigestFormState,
    formData: FormData,
  ) => Promise<DigestFormState>;
  initialValues: DigestFormValues;
  /** DIGEST_SECTIONS, passed in because src/lib/digests.ts is server-only. */
  sections: ReadonlyArray<{ key: DigestSectionKey; label: string }>;
  submitLabel: string;
};

function FieldError({ message, id }: { message?: string; id: string }) {
  if (!message) return null;
  return (
    <p id={id} className="text-xs text-destructive">
      {message}
    </p>
  );
}

export function DigestForm({ action, initialValues, sections, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initialValues;
  const errors = state.errors ?? {};

  const fieldProps = (name: DigestField) => ({
    id: name,
    name,
    defaultValue: values[name],
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <>
      <p className="mb-6 max-w-3xl border border-border bg-surface-raised px-4 py-3 text-sm text-text-secondary">
        Every factual claim should name its source. Use neutral wording.
        Historical comparisons describe similarities and differences; they are
        not forecasts.
      </p>

      {/* Remount with submitted values so fields survive React's post-action reset. */}
      <form
        key={JSON.stringify(values)}
        action={formAction}
        className="grid max-w-3xl gap-5"
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

        <div className="grid gap-5 sm:grid-cols-3">
          <div className="grid gap-2">
            <Label htmlFor="digest_date">Digest date</Label>
            <Input {...fieldProps("digest_date")} type="date" required />
            <FieldError id="digest_date-error" message={errors.digest_date} />
          </div>

          <div className="grid gap-2 sm:col-span-2">
            <Label htmlFor="title">Title</Label>
            <Input {...fieldProps("title")} required maxLength={200} />
            <FieldError id="title-error" message={errors.title} />
          </div>
        </div>

        <div className="grid gap-2">
          <Label htmlFor="review_status">Status</Label>
          <NativeSelect {...fieldProps("review_status")} className="w-48">
            <NativeSelectOption value="DRAFT">Draft</NativeSelectOption>
            <NativeSelectOption value="PUBLISHED">Published</NativeSelectOption>
          </NativeSelect>
          <p className="text-xs text-text-muted">
            Only published digests appear on the public site.
          </p>
          <FieldError id="review_status-error" message={errors.review_status} />
        </div>

        {sections.map(({ key, label }) => (
          <div key={key} className="grid gap-2">
            <Label htmlFor={key}>{label}</Label>
            <Textarea {...fieldProps(key)} rows={5} />
            <FieldError id={`${key}-error`} message={errors[key]} />
          </div>
        ))}

        <p className="-mt-2 text-xs text-text-muted">
          Plain text. Separate paragraphs with a blank line. Empty sections are
          not shown publicly.
        </p>

        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : submitLabel}
          </Button>
          <Link href="/admin/digests" className={buttonVariants({ variant: "ghost" })}>
            Cancel
          </Link>
        </div>
      </form>
    </>
  );
}
