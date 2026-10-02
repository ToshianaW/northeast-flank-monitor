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
import { EVENT_TYPE_LABELS, REVIEW_STATUS_LABELS } from "@/lib/event-labels";
import { listEvents } from "@/lib/events";
import { requireAdminPage } from "@/lib/admin-session";

export const metadata = { title: "Events" };

function formatDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export default async function AdminEventsPage({
  searchParams,
}: PageProps<"/admin/events">) {
  await requireAdminPage();
  await connection();
  const [{ saved }, events] = await Promise.all([searchParams, listEvents()]);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="meta-label mb-2">Admin · events</p>
          <h1 className="text-2xl font-semibold tracking-tight">Events</h1>
          <p className="mt-1 text-sm text-text-secondary">
            {events.length === 1 ? "1 event" : `${events.length} events`}
          </p>
        </div>
        <Link href="/admin/events/new" className={buttonVariants()}>
          Add event
        </Link>
      </div>

      {saved ? (
        <p
          role="status"
          className="mt-6 border border-operational-teal/40 bg-operational-teal/10 px-3 py-2 text-sm text-foreground"
        >
          Event saved.
        </p>
      ) : null}

      {events.length === 0 ? (
        <div className="mt-8 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">No events yet.</p>
          <p className="mt-1 text-xs text-text-muted">
            Add a draft event with at least one attached source.
          </p>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto border border-border bg-surface-dark">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="meta-label">Date</TableHead>
                <TableHead className="meta-label">Headline</TableHead>
                <TableHead className="meta-label">Type</TableHead>
                <TableHead className="meta-label">Status</TableHead>
                <TableHead className="meta-label sr-only">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {events.map((event) => (
                <TableRow key={event.event_id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {formatDate(event.event_date)}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-normal font-medium">{event.headline}</TableCell>
                  <TableCell className="text-xs">
                    {EVENT_TYPE_LABELS[event.event_type]}
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="font-mono text-xs">
                      {REVIEW_STATUS_LABELS[event.review_status]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Link
                      href={`/admin/events/${event.event_id}/edit`}
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
    </section>
  );
}
