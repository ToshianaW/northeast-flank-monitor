"use client";

import Link from "next/link";
import { useActionState } from "react";
import type { HistoricalImportState } from "@/app/admin/(console)/historical/actions";
import { ReviewerField } from "@/components/admin/reviewer-field";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export type ImportRow = {
  id: string;
  headline: string;
  event_date: string;
  reported_date: string | null;
  event_type: string;
  url: string;
  publisher: string;
  excerpt: string;
  excerpt_supports: string;
  date_rule: string;
  flags: string[];
  sourceName: string | null;
  sourceTier: number | null;
  alreadyImported: string | null;
  similarExisting: { id: string; headline: string } | null;
};

/** Ticked candidates are saved as DRAFT historical events; nothing is published here. */
export function ImportForm({
  action,
  groups,
  reviewerDefault,
}: {
  action: (state: HistoricalImportState, formData: FormData) => Promise<HistoricalImportState>;
  groups: ImportRow[][];
  reviewerDefault: string | null;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className="grid gap-6">
      {state.error ? (
        <p role="alert" className="border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state.results ? (
        <ul role="status" className="grid gap-1 border border-border bg-surface-dark p-3 text-sm">
          {state.results.map((r) => (
            <li key={r.id}>
              {r.ok ? "Saved" : "Not saved"}: {r.headline || r.id} — {r.message}
              {r.eventId ? (
                <>
                  {" "}
                  <Link href={`/admin/historical/${r.eventId}`} className="link">
                    Review
                  </Link>
                </>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {groups.map((group, gi) => (
        <fieldset key={group[0].id} className="grid gap-3 border border-border p-3">
          <legend className="px-1 text-xs text-text-muted">
            {group.length > 1 ? `Likely duplicates (${group.length}): tick one` : `Candidate ${gi + 1}`}
          </legend>
          {group.map((row) => {
            const blocked = !row.sourceName ? "Source not registered" : row.alreadyImported ? "Already imported" : null;
            return (
              <div key={row.id} className="grid gap-1.5 bg-surface-dark p-3">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    name="candidate"
                    value={row.id}
                    disabled={blocked !== null}
                    className="mt-1 size-4 accent-teal-blue"
                    aria-describedby={`why-${row.id}`}
                  />
                  <span className="font-medium">{row.headline}</span>
                </label>
                <p className="font-mono text-xs text-text-secondary">
                  {row.event_date} · {row.event_type} · reported {row.reported_date ?? "unknown"}
                </p>
                <p className="text-xs text-text-muted">Date rule: {row.date_rule}</p>
                <p className="text-sm">
                  &ldquo;{row.excerpt}&rdquo; <span className="text-text-muted">· supports: {row.excerpt_supports}</span>
                </p>
                <p className="text-xs">
                  <a href={row.url} target="_blank" rel="noopener noreferrer" className="link">
                    {row.publisher}
                  </a>{" "}
                  {row.sourceName ? (
                    <Badge variant="outline">
                      {row.sourceName} · Tier {row.sourceTier ?? "—"}
                    </Badge>
                  ) : null}
                </p>
                <p id={`why-${row.id}`} className="text-xs text-destructive">
                  {blocked ?? ""}
                </p>
                {row.similarExisting ? (
                  <p className="text-xs text-text-muted">
                    Similar existing event:{" "}
                    <Link href={`/admin/historical/${row.similarExisting.id}`} className="link">
                      {row.similarExisting.headline}
                    </Link>
                  </p>
                ) : null}
                {row.flags.map((f) => (
                  <p key={f} className="text-xs text-text-muted">
                    Flag: {f}
                  </p>
                ))}
              </div>
            );
          })}
        </fieldset>
      ))}

      <div className="max-w-md">
        <ReviewerField defaultValue={reviewerDefault} />
      </div>
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save ticked candidates as drafts"}
        </Button>
        <p className="mt-2 text-xs text-text-muted">
          Drafts go to the historical review queue. Nothing is published from this page.
        </p>
      </div>
    </form>
  );
}
