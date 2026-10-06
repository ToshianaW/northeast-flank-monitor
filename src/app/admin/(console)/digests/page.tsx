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
import { listDigests } from "@/lib/digests";
import { REVIEW_STATUS_LABELS } from "@/lib/event-labels";
import { requireAdminPage } from "@/lib/admin-session";
import { ListPager } from "@/components/admin/list-pager";
import { ListFilterForm } from "@/components/list-filter-form";
import { filterOptions, matchesFilters, paginate, parseListFilters } from "@/lib/list-filters";

export const metadata = { title: "Digests" };

export default async function AdminDigestsPage({
  searchParams,
}: PageProps<"/admin/digests">) {
  await requireAdminPage();
  await connection();
  const [params, all] = await Promise.all([searchParams, listDigests()]);
  // Digests cover the whole region, so they are searched by month only.
  const keyed = all.map((digest) => ({ digest, countries: [], month: digest.digest_date.slice(0, 7) }));
  const options = filterOptions(keyed);
  const filters = parseListFilters(params, { countries: [], months: options.months });
  const page = paginate(
    keyed.filter((k) => matchesFilters(k, filters)).map((k) => k.digest),
    params.page,
  );
  const digests = page.items;
  const searching = filters.month !== null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta-label mb-2">Admin · digests</p>
          <h1 className="text-2xl font-semibold tracking-tight">Daily digests</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {all.length === 1 ? "1 digest" : `${all.length} digests`}, newest first.
          </p>
        </div>
        <Link href="/admin/digests/new" className={buttonVariants()}>
          Add digest
        </Link>
      </div>

      {params.saved ? (
        <p
          role="status"
          className="mt-6 border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm text-foreground"
        >
          Digest saved.
        </p>
      ) : null}

      {all.length > 0 ? (
        <div className="mt-6">
          <ListFilterForm action="/admin/digests" filters={filters} months={options.months} />
        </div>
      ) : null}

      {all.length === 0 ? (
        <div className="mt-8 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">No digests yet.</p>
        </div>
      ) : digests.length === 0 ? (
        <p className="mt-6 text-sm text-text-muted">
          {searching ? "No digests for this month." : "No digests on this page."}
        </p>
      ) : (
        <div className="mt-6 overflow-x-auto border border-border bg-surface-dark">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="meta-label">Date</TableHead>
                <TableHead className="meta-label">Title</TableHead>
                <TableHead className="meta-label">Status</TableHead>
                <TableHead className="meta-label sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {digests.map((digest) => (
                <TableRow key={digest.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {digest.digest_date}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal font-medium">
                    {digest.title}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {REVIEW_STATUS_LABELS[digest.review_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/digests/${digest.id}/edit`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Edit
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ListPager base="/admin/digests" filters={filters} page={page} noun="digests" />
    </section>
  );
}
