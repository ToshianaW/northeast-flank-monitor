"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Shows `step` items, then a button that reveals `step` more at a time. The items are rendered
 * on the server and passed in; only the visible count lives here.
 */
export function ShowMoreList({ items, step = 3, label }: { items: React.ReactNode[]; step?: number; label: string }) {
  const [shown, setShown] = useState(step);
  const remaining = items.length - shown;
  return (
    <div className="grid gap-3">
      {items.slice(0, shown)}
      {remaining > 0 ? (
        <button
          type="button"
          onClick={() => setShown((n) => n + step)}
          className="btn-pill inline-flex w-fit items-center gap-1.5"
          aria-label={`Show ${Math.min(step, remaining)} more ${label} (${remaining} not shown)`}
        >
          <ChevronDown className="size-4" aria-hidden />
          Show {Math.min(step, remaining)} more
          <span className="font-mono text-xs text-text-muted">({remaining} left)</span>
        </button>
      ) : null}
    </div>
  );
}
