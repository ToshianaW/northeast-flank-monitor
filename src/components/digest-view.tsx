import Link from "next/link";
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
      <p className="font-mono text-xs text-text-secondary">
        {formatDigestDate(digest.digest_date)}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {digest.title}
      </h1>

      {shown.length === 0 ? (
        <p className="mt-8 text-base text-text-secondary">
          This digest has no content yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-8">
          {shown.map(({ key, label }) => (
            <section key={key} className="border-t border-border pt-5">
              <h2 className="meta-label mb-3">{label}</h2>
              <div className="max-w-3xl text-base leading-relaxed text-text-secondary">
                <PlainText text={digest.sections[key]} citations={citations} />
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-10 border-t border-border pt-4 text-xs text-text-muted">
        {digest.meta?.generator === "ai"
          ? "Drafted with AI assistance from published events and reviewed before publication. Numbers link to the events each sentence rests on."
          : "Compiled manually. Source details are attached to individual events."}
      </p>
    </article>
  );
}
