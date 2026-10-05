import { pageMetadata } from "@/lib/site-metadata";
import Link from "next/link";
import { connection } from "next/server";
import { DigestView, formatDigestDate } from "@/components/digest-view";
import { PageShell } from "@/components/page-shell";
import { collectDigestRefs } from "@/lib/digest-refs";
import {
  DIGEST_SECTIONS,
  getLatestPublishedDigest,
  listPublishedDigests,
  listPublishedEventHeadlines,
} from "@/lib/digests";

export const metadata = pageMetadata("/digest", "Daily digest", "The latest reviewed daily digest of observable military activity on NATO's northeastern flank.");

export default async function DigestPage() {
  await connection();
  const [latest, all] = await Promise.all([
    getLatestPublishedDigest(),
    listPublishedDigests(),
  ]);
  const earlier = all.filter((d) => d.id !== latest?.id);
  const eventHeadlines = await listPublishedEventHeadlines(
    latest ? collectDigestRefs(Object.values(latest.sections)) : [],
  );

  const earlierList =
    earlier.length > 0 ? (
      <section className="panel lg:sticky lg:top-20" aria-labelledby="earlier-digests">
        <h2 id="earlier-digests" className="mb-4 text-base font-semibold text-foreground">
          Earlier digests
        </h2>
        <ul className="-mx-2 grid gap-1">
          {earlier.map((d) => (
            <li key={d.id}>
              <Link
                href={`/digest/${d.digest_date}`}
                className="feed-item tone-teal-blue flex flex-col gap-1 py-3"
              >
                <span className="font-mono text-xs text-link">
                  {formatDigestDate(d.digest_date)}
                </span>
                <span className="text-sm text-foreground">{d.title}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    ) : undefined;

  return (
    <PageShell aside={earlierList} asideLabel="Earlier digests">
      {latest ? (
        <DigestView digest={latest} sections={DIGEST_SECTIONS} eventHeadlines={eventHeadlines} />
      ) : (
        <>
          <header className="mb-8 border-b border-border pb-6">
            <p className="meta-label mb-3">Daily digest</p>
            <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Northeast Flank Daily Digest
            </h1>
          </header>
          <div className="flex h-40 items-center justify-center rounded-xl border border-dashed border-border bg-background/60">
            <p className="text-base text-text-secondary">No digests published yet.</p>
          </div>
        </>
      )}
    </PageShell>
  );
}
