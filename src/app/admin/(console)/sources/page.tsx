import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { SourceDeleteButton } from "@/components/admin/source-delete-button";
import {
  isStateOfficialSource,
  RELIABILITY_LABELS,
  SOURCE_TYPE_LABELS,
} from "@/lib/source-labels";
import { listSources } from "@/lib/sources";
import { requireAdminPage } from "@/lib/admin-session";

export const metadata = { title: "Sources" };

export default async function AdminSourcesPage({
  searchParams,
}: PageProps<"/admin/sources">) {
  await requireAdminPage();
  await connection();
  const [params, sources] = await Promise.all([searchParams, listSources()]);
  const { saved, deleted, delete_blocked, delete_error } = params;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta-label mb-2">Admin · source registry</p>
          <h1 className="text-2xl font-semibold tracking-tight">Sources</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {sources.length === 1 ? "1 source" : `${sources.length} sources`}
          </p>
        </div>
        <Link href="/admin/sources/new" className={buttonVariants()}>
          Add source
        </Link>
      </div>

      {saved ? (
        <p
          role="status"
          className="mt-6 border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm text-foreground"
        >
          Source saved.
        </p>
      ) : null}
      {deleted ? (
        <p
          role="status"
          className="mt-6 border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm text-foreground"
        >
          Source deleted.
        </p>
      ) : null}
      {delete_blocked ? (
        <p
          role="status"
          className="mt-6 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
        >
          This source is linked to events, exercises, or review history and cannot
          be deleted.
        </p>
      ) : null}
      {delete_error ? (
        <p
          role="status"
          className="mt-6 border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-foreground"
        >
          Could not delete that source. Try again.
        </p>
      ) : null}

      {sources.length === 0 ? (
        <div className="mt-8 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">No sources yet.</p>
          <p className="mt-1 text-xs text-text-muted">
            Add the first source to start the registry.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto border border-border bg-surface-dark">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="meta-label">Name</TableHead>
                <TableHead className="meta-label">Tier</TableHead>
                <TableHead className="meta-label">Type</TableHead>
                <TableHead className="meta-label">Reliability</TableHead>
                <TableHead className="meta-label">Country</TableHead>
                <TableHead className="meta-label">Language</TableHead>
                <TableHead className="meta-label">Home URL</TableHead>
                <TableHead className="meta-label">Notes</TableHead>
                <TableHead className="meta-label sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sources.map((source) => (
                <TableRow key={source.id}>
                  <TableCell className="font-medium">
                    <div className="flex flex-col gap-1">
                      {source.name}
                      {isStateOfficialSource(source) ? (
                        <Badge variant="outline" className="border-slate-indigo text-text-secondary">
                          State / official source
                        </Badge>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {source.tier ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {SOURCE_TYPE_LABELS[source.source_type]}
                  </TableCell>
                  <TableCell className="text-xs">
                    {RELIABILITY_LABELS[source.reliability]}
                  </TableCell>
                  <TableCell className="text-xs">
                    {source.source_country ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {source.source_language ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-xs">
                    {source.home_url ? (
                      <a
                        href={source.home_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-teal-blue hover:underline"
                      >
                        {source.home_url}
                      </a>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="max-w-[18rem] truncate text-xs text-text-secondary">
                    {source.notes ?? "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <Link
                        href={`/admin/sources/${source.id}/edit`}
                        className={buttonVariants({ variant: "outline", size: "sm" })}
                      >
                        Edit
                      </Link>
                      <SourceDeleteButton
                        sourceId={source.id}
                        sourceName={source.name}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </section>
  );
}
