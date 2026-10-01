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
import {
  CONFIDENCE_LEVEL_LABELS,
  EVENT_TYPE_LABELS,
  REVIEW_STATUS_LABELS,
} from "@/lib/event-labels";
import { listReviewQueue } from "@/lib/review";
import { RELIABILITY_LABELS } from "@/lib/source-labels";

export const metadata = { title: "Review queue" };

export default async function ReviewQueuePage() {
  await connection();
  const items = await listReviewQueue();

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div>
        <p className="meta-label mb-2">Admin · review</p>
        <h1 className="text-2xl font-semibold tracking-tight">Review queue</h1>
        <p className="mt-1 text-sm text-text-secondary">
          Draft and pending events, oldest first.
        </p>
      </div>

      {items.length === 0 ? (
        <div className="mt-8 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">Nothing waiting for review.</p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto border border-border bg-surface-dark">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="meta-label">Date</TableHead>
                <TableHead className="meta-label">Headline</TableHead>
                <TableHead className="meta-label">Type</TableHead>
                <TableHead className="meta-label">Country</TableHead>
                <TableHead className="meta-label">Primary source</TableHead>
                <TableHead className="meta-label">Reliability</TableHead>
                <TableHead className="meta-label">Confidence</TableHead>
                <TableHead className="meta-label">Contradiction</TableHead>
                <TableHead className="meta-label">Status</TableHead>
                <TableHead className="meta-label sr-only">Review</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.event_id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {item.event_date.toISOString().slice(0, 10)}
                  </TableCell>
                  <TableCell className="max-w-xs whitespace-normal font-medium">{item.headline}</TableCell>
                  <TableCell className="text-xs">
                    {EVENT_TYPE_LABELS[item.event_type]}
                  </TableCell>
                  <TableCell className="text-xs">{item.country ?? "—"}</TableCell>
                  <TableCell className="text-xs">
                    {item.primary_source_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.primary_source_reliability
                      ? RELIABILITY_LABELS[item.primary_source_reliability]
                      : "—"}
                  </TableCell>
                  <TableCell className="text-xs">
                    {CONFIDENCE_LEVEL_LABELS[item.confidence_level]}
                  </TableCell>
                  <TableCell className="text-xs">
                    {item.contradiction_flag ? "Yes" : "No"}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {REVIEW_STATUS_LABELS[item.review_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/review/${item.event_id}`}
                      className={buttonVariants({ variant: "outline", size: "sm" })}
                    >
                      Review
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
