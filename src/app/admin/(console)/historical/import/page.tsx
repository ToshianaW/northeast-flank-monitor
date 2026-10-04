import Link from "next/link";
import { connection } from "next/server";
import { BackLink } from "@/components/admin/back-link";
import { ImportForm, type ImportRow } from "@/components/historical/import-form";
import { requireAdminPage } from "@/lib/admin-session";
import { candidateStatuses, listCandidateFiles, readCandidateFile } from "@/lib/historical-import";
import { getReviewerName } from "@/lib/reviewer";
import { importHistoricalAction } from "../actions";

export const metadata = { title: "Import historical candidates" };

export default async function HistoricalImportPage({ searchParams }: PageProps<"/admin/historical/import">) {
  await requireAdminPage();
  await connection();
  const { file: fileParam } = await searchParams;
  const files = listCandidateFiles();
  const fileName = typeof fileParam === "string" ? fileParam : null;
  const loaded = fileName ? readCandidateFile(fileName) : null;
  const groups =
    loaded?.ok === true
      ? (await candidateStatuses(loaded.file)).map((g) =>
          g.map(
            (s): ImportRow => ({
              id: s.candidate.id,
              headline: s.candidate.headline,
              event_date: s.candidate.event_date,
              reported_date: s.candidate.reported_date,
              event_type: s.candidate.event_type,
              url: s.candidate.url,
              publisher: s.candidate.publisher,
              excerpt: s.candidate.excerpt,
              excerpt_supports: s.candidate.excerpt_supports,
              date_rule: s.candidate.date_rule,
              flags: s.candidate.flags,
              sourceName: s.source?.name ?? null,
              sourceTier: s.source?.tier ?? null,
              alreadyImported: s.alreadyImported,
              similarExisting: s.similarExisting,
            }),
          ),
        )
      : [];
  const reviewerDefault = await getReviewerName();

  return (
    <section className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6">
      <BackLink href="/admin/historical" label="Back to historical" />
      <p className="meta-label mb-2">Admin · historical · import</p>
      <h1 className="text-2xl font-semibold tracking-tight">Import suggester candidates</h1>
      <p className="mt-1 max-w-2xl text-sm text-text-secondary">
        Candidates from <code>npm run historical:suggest -- --out …</code>, read from the git-ignored folder
        data/historical/candidates/. Ticked candidates are saved as drafts with your name in the audit log. The
        model&rsquo;s support line and date rule go to internal notes. Publishing stays in the normal review.
      </p>

      <nav aria-label="Candidate files" className="mt-6 grid gap-1 text-sm">
        {files.length === 0 ? <p className="text-text-muted">No candidate files found.</p> : null}
        {files.map((f) => (
          <Link
            key={f}
            href={`/admin/historical/import?file=${encodeURIComponent(f)}`}
            aria-current={f === fileName ? "page" : undefined}
            className={f === fileName ? "font-medium text-foreground" : "link"}
          >
            {f}
          </Link>
        ))}
      </nav>

      <div className="mt-6">
        {loaded && !loaded.ok ? <p className="text-sm text-destructive">{loaded.error}</p> : null}
        {loaded?.ok && groups.length === 0 ? <p className="text-sm text-text-muted">This file has no candidates.</p> : null}
        {loaded?.ok && groups.length > 0 ? (
          <ImportForm action={importHistoricalAction.bind(null, fileName!)} groups={groups} reviewerDefault={reviewerDefault} />
        ) : null}
      </div>
    </section>
  );
}
