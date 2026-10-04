"use client";

import { useState } from "react";
import { formatEventDate } from "@/components/event-log-entry";
import type { TimelineStretch } from "@/content/ukraine-prelude-timeline";
import { monthSpan } from "@/lib/historical-rules";

export const CONTEXT_HEADING = "Context: Russia, Belarus and Ukraine, before 24 February 2022";
export const CONTEXT_CAPTION =
  "Compiled from the sources linked. Not part of the event record below. Gaps mean no milestone is listed, not that nothing happened. The milestones are a selection, not a complete chronology.";

/** The date line under a stretch's name. */
export function stretchDates(s: TimelineStretch): string {
  return s.dateLabel ?? monthSpan(s.from, s.to);
}

/**
 * One band of five equal, touching segments, Aug 2020 to Feb 2022. Each segment is a button that
 * opens its dated milestones and source links in the panel below. On phones they stack vertically.
 * No marker for today, no arrows, no trend lines.
 */
export function ContextTimeline({ stretches }: { stretches: TimelineStretch[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const selected = stretches.find((s) => s.id === open) ?? null;

  return (
    <section aria-labelledby="context-heading" className="grid gap-3">
      <h2 id="context-heading" className="text-lg font-semibold tracking-tight">
        {CONTEXT_HEADING}
      </h2>
      <p className="text-sm text-text-muted">{CONTEXT_CAPTION}</p>

      <div className="grid gap-2">
        <ul className="grid grid-cols-1 border border-border sm:grid-cols-5">
          {stretches.map((s) => {
            const isOpen = s.id === open;
            return (
              <li key={s.id} className="border-border [&:not(:first-child)]:border-t sm:[&:not(:first-child)]:border-t-0 sm:[&:not(:first-child)]:border-l">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  aria-controls="context-panel"
                  onClick={() => setOpen(isOpen ? null : s.id)}
                  className={`h-full w-full px-3 py-3 text-left text-sm leading-snug focus-visible:relative focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-teal-blue ${
                    isOpen ? "bg-teal-blue/15 text-foreground" : "bg-surface-raised text-foreground hover:bg-surface-dark"
                  }`}
                >
                  <span className="block font-medium [text-wrap:balance]">{s.label}</span>
                  <span className="mt-1 block whitespace-nowrap font-mono text-xs text-text-muted">{stretchDates(s)}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div id="context-panel" aria-live="polite">
        {selected ? (
          <div className="border-l-2 border-teal-blue bg-surface-dark px-4 py-3">
            <h3 className="font-medium">
              {selected.label} <span className="font-mono text-xs text-text-muted">· {stretchDates(selected)}</span>
            </h3>
            <ol className="mt-3 grid gap-4">
              {selected.milestones.map((m) => (
                <li key={`${m.date}-${m.text.slice(0, 20)}`} className="grid gap-1">
                  <p className="font-mono text-xs text-text-secondary">{formatEventDate(new Date(`${m.date}T00:00:00Z`))}</p>
                  <p className="text-base">{m.text}</p>
                  {m.claim ? (
                    <p>
                      <span className="pill tint tone-neutral">Claim · {m.claim}</span>
                    </p>
                  ) : null}
                  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {m.sources.map((src) => (
                      <li key={src.url}>
                        <a href={src.url} target="_blank" rel="noopener noreferrer" className="link">
                          {src.name}
                        </a>
                        {src.state ? <span className="ml-1 text-xs text-text-muted">(state source)</span> : null}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="text-sm text-text-muted">Select a period to see its dated milestones and sources.</p>
        )}
      </div>
    </section>
  );
}
