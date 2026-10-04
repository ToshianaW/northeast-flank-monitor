import Link from "next/link";
import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { requireAdminPage } from "@/lib/admin-session";
import { EVENT_TYPE_LABELS } from "@/lib/event-labels";
import { countHistoricalByStatus, listHistoricalEvents } from "@/lib/historical";
import { HISTORICAL_STATUS_VALUES, type HistoricalStatus } from "@/lib/historical-rules";

export const metadata = { title: "Historical" };

const TABS: Array<{ key: string; label: string; status: HistoricalStatus | null }> = [
  { key: "queue", label: "Review queue", status: "DRAFT" },
  { key: "published", label: "Published", status: "PUBLISHED" },
  { key: "rejected", label: "Rejected", status: "REJECTED" },
  { key: "all", label: "All", status: null },
];

const STATUS_LABELS: Record<HistoricalStatus, string> = {
  DRAFT: "Draft (in queue)",
  PUBLISHED: "Published",
  REJECTED: "Rejected",
};

export default async function AdminHistoricalPage({ searchParams }: PageProps<"/admin/historical">) {
  await requireAdminPage();
  await connection();
  const { tab: tabParam } = await searchParams;
  const tab = TABS.find((t) => t.key === tabParam) ?? TABS[0];
  const [items, counts] = await Promise.all([listHistoricalEvents(tab.status), countHistoricalByStatus()]);
  const total = HISTORICAL_STATUS_VALUES.reduce((n, s) => n + counts[s], 0);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta-label mb-2">Admin · historical (Aug 2020 – Feb 2022)</p>
          <h1 className="text-2xl font-semibold tracking-tight">Historical record</h1>
          <p className="mt-1 max-w-2xl text-sm text-text-secondary">
            A separate dataset with its own queue. Nothing here appears in Latest, the map, the archive or the
            digest. Every save and review action is logged with the reviewer&rsquo;s name.
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/admin/historical/import" className={buttonVariants({ variant: "outline" })}>
            Import candidates
          </Link>
          <Link href="/admin/historical/new" className={buttonVariants()}>
            Add historical event
          </Link>
        </div>
      </div>

      <nav aria-label="Historical status" className="mt-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={t.key === "queue" ? "/admin/historical" : `/admin/historical?tab=${t.key}`}
            aria-current={t.key === tab.key ? "page" : undefined}
            className={buttonVariants({ variant: t.key === tab.key ? "default" : "outline", size: "sm" })}
          >
            {t.label} ({t.status ? counts[t.status] : total})
          </Link>
        ))}
      </nav>

      {items.length === 0 ? (
        <div className="mt-6 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">Nothing here.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto border border-border bg-surface-dark">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="meta-label">Date</TableHead>
                <TableHead className="meta-label">Headline</TableHead>
                <TableHead className="meta-label">Type</TableHead>
                <TableHead className="meta-label">Phase</TableHead>
                <TableHead className="meta-label">Sources</TableHead>
                <TableHead className="meta-label">Status</TableHead>
                <TableHead className="meta-label sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.event_id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {item.event_date.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal font-medium">{item.headline}</TableCell>
                  <TableCell className="text-xs">{EVENT_TYPE_LABELS[item.event_type]}</TableCell>
                  <TableCell className="font-mono text-xs">{item.phase_tag ?? "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{item.source_count}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {STATUS_LABELS[item.review_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/historical/${item.event_id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      {item.review_status === "DRAFT" ? "Review" : "Open"}
                    </Link>
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
