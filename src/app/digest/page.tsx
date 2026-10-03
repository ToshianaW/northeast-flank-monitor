import Link from "next/link";
import { connection } from "next/server";
import { DigestView, formatDigestDate } from "@/components/digest-view";
import { collectDigestRefs } from "@/lib/digest-refs";
import {
  DIGEST_SECTIONS,
  getLatestPublishedDigest,
  listPublishedDigests,
  listPublishedEventHeadlines,
} from "@/lib/digests";

export const metadata = { title: "Daily digest" };

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

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 sm:px-6">
      {latest ? (
        <DigestView digest={latest} sections={DIGEST_SECTIONS} eventHeadlines={eventHeadlines} />
      ) : (
        <>
          <p className="meta-label mb-3">Daily digest</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            Northeast Flank Daily Digest
          </h1>
          <div className="mt-8 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
            <p className="text-base text-text-secondary">No digests published yet.</p>
          </div>
        </>
      )}

      {earlier.length > 0 ? (
        <section className="mt-12" aria-labelledby="earlier-digests">
          <h2 id="earlier-digests" className="meta-label mb-3">
            Earlier digests
          </h2>
          <ul className="divide-y divide-border border-y border-border">
            {earlier.map((d) => (
              <li key={d.id}>
                <Link
                  href={`/digest/${d.digest_date}`}
                  className="flex flex-wrap items-baseline gap-x-4 gap-y-1 py-3 hover:text-link transition-colors"
                >
                  <span className="font-mono text-xs text-text-secondary">
                    {formatDigestDate(d.digest_date)}
                  </span>
                  <span className="text-base">{d.title}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
