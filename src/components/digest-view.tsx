import Link from "next/link";
import { Info } from "lucide-react";
import { hasMarker, parseDigestLine } from "@/lib/digest-refs";
import type { Digest, DigestSectionKey } from "@/lib/digests";

const MONTHS = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

/** "2026-10-01" → "01 OCT 2026" */
export function formatDigestDate(date: string): string {
  const [y, m, d] = date.split("-");
  return `${d} ${MONTHS[Number(m) - 1]} ${y}`;
}

/** "2026-10-01" → "1 Oct 2026" */
export function formatDigestDateShort(date: string): string {
  const [y, m, d] = date.split("-");
  const month = MONTHS[Number(m) - 1];
  return `${Number(d)} ${month[0]}${month.slice(1).toLowerCase()} ${y}`;
}

/** Digest-wide citation numbers, assigned in reading order to events that are still published. */
type Citations = {
  numberFor: (id: string) => number | null;
  headlines: ReadonlyMap<string, string>;
};

function makeCitations(
  digest: Digest,
  sections: ReadonlyArray<{ key: DigestSectionKey }>,
  headlines: ReadonlyMap<string, string>,
): Citations {
  const numbers = new Map<string, number>();
  for (const { key } of sections) {
    for (const line of digest.sections[key].split("\n")) {
      for (const id of parseDigestLine(line).eventIds) {
        if (headlines.has(id) && !numbers.has(id)) numbers.set(id, numbers.size + 1);
      }
    }
  }
  return { numberFor: (id) => numbers.get(id) ?? null, headlines };
}

/** One referenced sentence: text node, then [n] links to the cited event pages. */
function CitedSentence({ line, citations }: { line: string; citations: Citations }) {
  const { text, eventIds } = parseDigestLine(line);
  return (
    <>
      {text}
      {eventIds.map((id) => {
        const n = citations.numberFor(id);
        if (n === null) return null;
        return (
          <Link
            key={id}
            href={`/events/${id}`}
            title={citations.headlines.get(id)}
            aria-label={`Event ${n}: ${citations.headlines.get(id)}`}
            className="ml-0.5 align-super font-mono text-[0.7em] link"
          >
            [{n}]
          </Link>
        );
      })}{" "}
    </>
  );
}

/** Blank lines split paragraphs. Plain text only; referenced sentences run on within a paragraph. */
function PlainText({ text, citations }: { text: string; citations: Citations }) {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim() !== "");
  return (
    <div className="grid gap-3">
      {paragraphs.map((p, i) => {
        const lines = p.split("\n").filter((l) => l.trim() !== "");
        if (!lines.some(hasMarker)) {
          return (
            <p key={i} className="whitespace-pre-line">
              {p}
            </p>
          );
        }
        return (
          <p key={i}>
            {lines.map((line, j) => (
              <CitedSentence key={j} line={line} citations={citations} />
            ))}
          </p>
        );
      })}
    </div>
  );
}

export function DigestView({
  digest,
  sections,
  eventHeadlines,
}: {
  digest: Digest;
  sections: ReadonlyArray<{ key: DigestSectionKey; label: string }>;
  /** Headlines of the PUBLISHED events the digest cites; others get no link. */
  eventHeadlines: ReadonlyMap<string, string>;
}) {
  const shown = sections.filter(({ key }) => digest.sections[key].trim() !== "");
  const citations = makeCitations(digest, shown, eventHeadlines);

  return (
    <article>
      <header className="mb-8 border-b border-border pb-6">
        <div className="flex flex-wrap items-center gap-3">
          <p className="meta-label">Daily digest</p>
          <span className="pill tint tone-teal-blue font-mono">
            <time dateTime={digest.digest_date}>{formatDigestDate(digest.digest_date)}</time>
          </span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight sm:text-3xl">
          {digest.title}
        </h1>
      </header>

      {shown.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-background/60">
          <p className="text-base text-text-secondary">This digest has no content yet.</p>
        </div>
      ) : (
        <div className="grid gap-5">
          {shown.map(({ key, label }, i) => (
            <section key={key} aria-labelledby={`digest-${key}`} className="panel">
              <h2
                id={`digest-${key}`}
                className="mb-4 flex items-center gap-3 text-base font-semibold text-foreground"
              >
                <span
                  className="tint tone-teal-blue flex size-7 shrink-0 items-center justify-center rounded-lg font-mono text-xs"
                  aria-hidden
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                {label}
              </h2>
              <div
                className={`max-w-[68ch] text-base leading-7 ${
                  i === 0 ? "text-foreground" : "text-text-secondary"
                }`}
              >
                <PlainText text={digest.sections[key]} citations={citations} />
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-6 flex items-start gap-2 rounded-xl border border-border bg-surface-dark/60 px-4 py-3 text-xs leading-relaxed text-text-secondary">
        <Info className="mt-0.5 size-3.5 shrink-0 text-link" aria-hidden />
        {digest.meta?.generator === "ai"
          ? "Drafted with AI assistance from published events and reviewed before publication. Numbers link to the events each sentence rests on."
          : "Compiled manually. Source details are attached to individual events."}
      </p>
    </article>
  );
}
