"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Admin review only: the event's summary and source link, ready to paste into X by hand.
 * Built by buildPostText (src/lib/x-text.ts), so it already fits X's 280-character limit.
 */
export function XPostCopy({ text, weight, refusal }: { text: string | null; weight: number; refusal: string | null }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="border border-border px-4 py-3">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h2 className="meta-label">Post for X (admin only)</h2>
        {text ? (
          <div className="flex items-center gap-3">
            <span className="font-mono text-xs text-text-muted">{weight}/280</span>
            <Button type="button" variant="outline" size="sm" onClick={copy}>
              {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        ) : null}
      </div>
      {text ? (
        <textarea
          readOnly
          value={text}
          rows={Math.min(8, text.split("\n").length + 3)}
          onFocus={(e) => e.currentTarget.select()}
          className="w-full resize-none border border-border bg-surface-dark/60 px-3 py-2 font-mono text-xs leading-relaxed"
        />
      ) : (
        <p className="text-sm text-text-secondary">Not ready to post: {refusal}.</p>
      )}
    </section>
  );
}
