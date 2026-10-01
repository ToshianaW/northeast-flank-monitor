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

/** Blank lines split paragraphs; single line breaks are kept by pre-line. Plain text only. */
function PlainText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim() !== "");
  return (
    <div className="grid gap-3">
      {paragraphs.map((p, i) => (
        <p key={i} className="whitespace-pre-line">
          {p}
        </p>
      ))}
    </div>
  );
}

export function DigestView({
  digest,
  sections,
}: {
  digest: Digest;
  sections: ReadonlyArray<{ key: DigestSectionKey; label: string }>;
}) {
  const shown = sections.filter(({ key }) => digest.sections[key].trim() !== "");

  return (
    <article>
      <p className="font-mono text-xs text-text-secondary">
        {formatDigestDate(digest.digest_date)}
      </p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
        {digest.title}
      </h1>

      {shown.length === 0 ? (
        <p className="mt-8 text-sm text-text-secondary">
          This digest has no content yet.
        </p>
      ) : (
        <div className="mt-8 grid gap-8">
          {shown.map(({ key, label }) => (
            <section key={key} className="border-t border-border pt-5">
              <h2 className="meta-label mb-3">{label}</h2>
              <div className="max-w-3xl text-sm leading-relaxed text-text-secondary sm:text-base">
                <PlainText text={digest.sections[key]} />
              </div>
            </section>
          ))}
        </div>
      )}

      <p className="mt-10 border-t border-border pt-4 text-xs text-text-muted">
        Compiled manually. Source details are attached to individual events.
      </p>
    </article>
  );
}
