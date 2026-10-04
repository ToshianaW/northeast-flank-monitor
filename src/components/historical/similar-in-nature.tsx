import Link from "next/link";
import {
  HISTORICAL_LABEL_TEXT,
  REFERENCES_HEADING,
  SIMILARITY_CAVEAT,
  VIEW_ENTRY,
  type ReferenceLine,
} from "@/lib/historical-references-rules";

/**
 * Public box on /events/[id]: reviewer-approved historical references. Every string is composed
 * by code (historical-references-rules.ts); a headline that fails the wording check is replaced
 * by the entry's date, type and a "View entry" link.
 */
export function SimilarInNature({ lines }: { lines: ReferenceLine[] }) {
  if (lines.length === 0) return null;
  return (
    <section aria-labelledby="similar-in-nature" className="border-t border-border pt-5">
      <h2 id="similar-in-nature" className="meta-label mb-1">
        {REFERENCES_HEADING}
      </h2>
      <p className="mb-3 text-xs text-text-muted">{HISTORICAL_LABEL_TEXT}</p>
      <ul className="grid gap-3">
        {lines.map((l) => (
          <li key={l.href} className="text-base">
            {l.headline ? (
              <>
                <Link href={l.href} className="link">
                  {l.headline}
                </Link>{" "}
                <span className="font-mono text-xs text-text-secondary">({l.date})</span>
              </>
            ) : (
              <>
                <span className="font-mono text-xs text-text-secondary">{l.date}</span> · {l.typeLabel} ·{" "}
                <Link href={l.href} className="link">
                  {VIEW_ENTRY}
                </Link>
              </>
            )}
            <span className="mt-0.5 block text-sm text-text-secondary">{l.shared}</span>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm text-foreground">{SIMILARITY_CAVEAT}</p>
    </section>
  );
}
