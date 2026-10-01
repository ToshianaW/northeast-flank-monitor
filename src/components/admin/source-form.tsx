"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { SourceFormState } from "@/app/admin/(console)/sources/actions";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import {
  COUNTRY_SUGGESTIONS,
  RELIABILITY_LABELS,
  RELIABILITY_VALUES,
  SOURCE_TYPE_LABELS,
  SOURCE_TYPE_VALUES,
  TIER_LABELS,
} from "@/lib/source-labels";
import type { SourceField, SourceFormValues } from "@/lib/sources";

type Props = {
  action: (
    state: SourceFormState,
    formData: FormData,
  ) => Promise<SourceFormState>;
  initialValues: SourceFormValues;
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

export function SourceForm({ action, initialValues, submitLabel }: Props) {
  const [state, formAction, pending] = useActionState(action, {});
  const values = state.values ?? initialValues;
  const errors = state.errors ?? {};

  const fieldProps = (name: SourceField) => ({
    id: name,
    name,
    defaultValue: values[name],
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${name}-error` : undefined,
  });

  return (
    <form action={formAction} className="grid max-w-3xl gap-5" noValidate>
      {state.formError ? (
        <p
          role="alert"
          className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          {state.formError}
        </p>
      ) : null}

      <div className="grid gap-2">
        <Label htmlFor="name">Name</Label>
        <Input {...fieldProps("name")} required maxLength={200} />
        <FieldError id="name-error" message={errors.name} />
      </div>

      <div className="grid gap-2">
        <Label htmlFor="home_url">Home URL</Label>
        <Input
          {...fieldProps("home_url")}
          type="url"
          inputMode="url"
          placeholder="https://"
        />
        <FieldError id="home_url-error" message={errors.home_url} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <Label htmlFor="source_type">Source type</Label>
          <NativeSelect {...fieldProps("source_type")} className="w-full">
            {SOURCE_TYPE_VALUES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {SOURCE_TYPE_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="source_type-error" message={errors.source_type} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="reliability">Reliability</Label>
          <NativeSelect {...fieldProps("reliability")} className="w-full">
            {RELIABILITY_VALUES.map((value) => (
              <NativeSelectOption key={value} value={value}>
                {RELIABILITY_LABELS[value]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <p className="text-xs text-text-muted">
            Standing trust in this outlet overall, not in any single claim.
          </p>
          <FieldError id="reliability-error" message={errors.reliability} />
        </div>
      </div>

      <div className="grid gap-5 sm:grid-cols-3">
        <div className="grid gap-2">
          <Label htmlFor="tier">Tier</Label>
          <NativeSelect {...fieldProps("tier")} className="w-full">
            <NativeSelectOption value="">Not assigned</NativeSelectOption>
            {([1, 2, 3, 4] as const).map((tier) => (
              <NativeSelectOption key={tier} value={String(tier)}>
                {TIER_LABELS[tier]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          <FieldError id="tier-error" message={errors.tier} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="source_country">Country</Label>
          <Input {...fieldProps("source_country")} list="country-suggestions" />
          <datalist id="country-suggestions">
            {COUNTRY_SUGGESTIONS.map((country) => (
              <option key={country} value={country} />
            ))}
          </datalist>
          <FieldError id="source_country-error" message={errors.source_country} />
        </div>

        <div className="grid gap-2">
          <Label htmlFor="source_language">Language</Label>
          <Input {...fieldProps("source_language")} placeholder="e.g. Lithuanian" />
          <FieldError id="source_language-error" message={errors.source_language} />
        </div>
      </div>

      <p className="-mt-2 text-xs text-text-muted">
        Official government or military sources with country Russia or Belarus
        are shown publicly as &ldquo;State / official source&rdquo;.
      </p>

      <div className="grid gap-2">
        <Label htmlFor="notes">Notes</Label>
        <Textarea {...fieldProps("notes")} rows={4} />
        <p className="text-xs text-text-muted">Shown on the public Sources page.</p>
        <FieldError id="notes-error" message={errors.notes} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : submitLabel}
        </Button>
        <Link
          href="/admin/sources"
          className={buttonVariants({ variant: "ghost" })}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}
