import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminReference } from "@/lib/historical-references";
import {
  ATTRIBUTE_LABELS,
  MAX_REFERENCES,
  REFERENCE_ATTRIBUTES,
  referenceDate,
  type ReferenceAttribute,
} from "@/lib/historical-references-rules";
import { PER_CLICK_CAP_USD, SUGGEST_MODEL } from "@/lib/historical-reference-suggest";

export type PanelSuggestion = {
  historical_event_id: string;
  headline: string;
  event_date: Date;
  attributes: ReferenceAttribute[];
};

function ReviewerInput({ id, defaultValue }: { id: string; defaultValue: string | null }) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>Reviewer name</Label>
      <Input id={id} name="reviewer" defaultValue={defaultValue ?? ""} required maxLength={120} autoComplete="name" />
    </div>
  );
}

/**
 * Admin panel on the event edit page: approved references (with unlink), a button that asks the
 * model for suggestions, and the suggestions to approve one by one. The model writes no text
 * here or anywhere public; it only proposes entries and attributes from the fixed list.
 */
export function ReferencePanel({
  applied,
  aiEnabled,
  published,
  references,
  suggestions,
  message,
  reviewerDefault,
  suggestAction,
  approveAction,
  unlinkAction,
}: {
  applied: boolean;
  /** REFERENCES_AI_SUGGEST: while off, the Suggest button is hidden. */
  aiEnabled: boolean;
  published: boolean;
  references: AdminReference[];
  suggestions: PanelSuggestion[];
  message: string | null;
  reviewerDefault: string | null;
  suggestAction: () => Promise<void>;
  approveAction: (formData: FormData) => Promise<void>;
  unlinkAction: (historicalEventId: string, formData: FormData) => Promise<void>;
}) {
  const full = references.length >= MAX_REFERENCES;
  return (
    <section id="historical-references" aria-labelledby="historical-references-heading" className="panel mt-8 grid gap-4">
      <h2 id="historical-references-heading" className="text-lg font-semibold">
        Historical references
      </h2>
      <p className="max-w-3xl text-sm text-text-secondary">
        Up to {MAX_REFERENCES} published historical entries are shown on this event&rsquo;s public page with the
        attributes they share. When the event is published, code links entries with the same event type and
        country automatically (no AI). Any link can be removed here; a removed pair is never linked again
        automatically.{" "}
        {aiEnabled
          ? `Optional AI suggestions come from ${SUGGEST_MODEL} (at most ${PER_CLICK_CAP_USD.toFixed(2)} per click); the model only proposes entries and writes no public text, and a person approves each one.`
          : "AI suggestions are switched off on this server."}
      </p>
      {message ? (
        <p role="status" className="border-l-2 border-teal-blue pl-3 text-sm">
          {message}
        </p>
      ) : null}

      {!applied ? (
        <p className="text-sm text-text-muted">Not available until migration 0010 is applied.</p>
      ) : (
        <>
          {references.length === 0 ? (
            <p className="text-sm text-text-muted">No references yet.</p>
          ) : (
            <ul className="grid gap-3">
              {references.map((r) => (
                <li key={r.historical_event_id} className="grid gap-2 border-b border-border pb-3 sm:grid-cols-[1fr_auto] sm:items-end">
                  <div className="text-sm">
                    <Link href={`/admin/historical/${r.historical_event_id}`} className="link">
                      {r.headline}
                    </Link>{" "}
                    <span className="text-text-secondary">
                      · {referenceDate(r.event_date)} · {r.shared_attributes.map((a) => ATTRIBUTE_LABELS[a]).join(", ")} ·{" "}
                      {r.matched_by === "AUTO"
                        ? "linked automatically"
                        : `approved by ${r.reviewer}${r.ai_suggested ? " (AI-suggested)" : ""}`}
                      {r.historical_status !== "PUBLISHED" ? " · hidden: the historical entry is not published" : ""}
                    </span>
                  </div>
                  <form action={unlinkAction.bind(null, r.historical_event_id)} className="flex items-end gap-2">
                    <ReviewerInput id={`unlink-reviewer-${r.historical_event_id}`} defaultValue={reviewerDefault} />
                    <Button type="submit" variant="outline">
                      Remove
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          )}

          {aiEnabled ? (
            <form action={suggestAction}>
              <Button type="submit" variant="outline" disabled={!published || full}>
                Suggest historical references
              </Button>
              {!published ? <p className="mt-1 text-xs text-text-muted">Publish the event first.</p> : null}
              {full ? <p className="mt-1 text-xs text-text-muted">This event has the maximum of {MAX_REFERENCES}.</p> : null}
            </form>
          ) : null}

          {aiEnabled && suggestions.length > 0 ? (
            <form action={approveAction} className="grid gap-4">
              <fieldset className="grid gap-3">
                <legend className="mb-1 text-sm font-medium">Suggestions to review</legend>
                {suggestions.map((s) => (
                  <div key={s.historical_event_id} className="grid gap-2 border-b border-border pb-3">
                    <label className="flex items-start gap-2 text-sm">
                      <input type="checkbox" name="ref" value={s.historical_event_id} className="mt-1" />
                      <span>
                        <Link href={`/historical/${s.historical_event_id}`} className="link" target="_blank">
                          {s.headline}
                        </Link>{" "}
                        <span className="text-text-secondary">· {referenceDate(s.event_date)}</span>
                      </span>
                    </label>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 pl-6 text-sm">
                      {REFERENCE_ATTRIBUTES.map((a) => (
                        <label key={a} className="flex items-center gap-1.5">
                          <input type="checkbox" name={`attr_${s.historical_event_id}`} value={a} defaultChecked={s.attributes.includes(a)} />
                          {ATTRIBUTE_LABELS[a]}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>
              <div className="flex flex-wrap items-end gap-3">
                <ReviewerInput id="approve-reviewer" defaultValue={reviewerDefault} />
                <Button type="submit">Approve selected</Button>
              </div>
              <p className="text-xs text-text-muted">
                Type, country and actor are checked against both entries before saving; an attribute that does not hold
                is dropped.
              </p>
            </form>
          ) : null}
        </>
      )}
    </section>
  );
}
