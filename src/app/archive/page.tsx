import Link from "next/link";
import { connection } from "next/server";
import { ArchiveFilters } from "@/components/archive-filters";
import { EventLogEntry } from "@/components/event-log-entry";
import {
  ARCHIVE_PAGE_SIZE,
  archiveQueryString,
  listArchiveEvents,
  listArchiveFilterOptions,
  parseArchiveFilters,
} from "@/lib/public-events";

export const metadata = { title: "Archive" };

export default async function ArchivePage({ searchParams }: PageProps<"/archive">) {
  await connection();
  const { filters, page } = parseArchiveFilters(await searchParams);
  const [{ events, total }, options] = await Promise.all([
    listArchiveEvents(filters, page),
    listArchiveFilterOptions(),
  ]);

  const lastPage = Math.max(1, Math.ceil(total / ARCHIVE_PAGE_SIZE));
  const hasFilters = archiveQueryString(filters) !== "";
  const firstShown = (page - 1) * ARCHIVE_PAGE_SIZE + 1;
  const lastShown = firstShown + events.length - 1;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="meta-label mb-3">Event archive</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Archive</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
        All published events, newest first. Filters are kept in the address, so
        any view can be bookmarked or shared.
      </p>

      <div className="mt-8">
        <ArchiveFilters
          filters={filters}
          countries={options.countries}
          actors={options.actors}
        />
      </div>

      <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-mono text-xs text-text-secondary">
          {total === 1 ? "1 event" : `${total} events`}
          {hasFilters ? " match these filters" : ""}
          {events.length > 0 && total > ARCHIVE_PAGE_SIZE
            ? ` · showing ${firstShown}–${lastShown}`
            : ""}
        </p>
        {hasFilters ? (
          <Link href="/archive" className="text-xs text-teal-blue hover:underline">
            Clear filters
          </Link>
        ) : null}
      </div>

      {events.length === 0 ? (
        <div className="mt-4 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">
            {total > 0
              ? "This page is past the end of the results."
              : hasFilters
                ? "No published events match these filters."
                : "No published events yet."}
          </p>
          {total > 0 ? (
            <Link
              href={`/archive${archiveQueryString(filters)}`}
              className="mt-2 inline-block text-xs text-teal-blue hover:underline"
            >
              Go to the first page
            </Link>
          ) : null}
        </div>
      ) : (
        <div className="mt-4 max-w-4xl divide-y divide-border border-y border-border">
          {events.map((event) => (
            <EventLogEntry key={event.event_id} event={event} />
          ))}
        </div>
      )}

      {lastPage > 1 ? (
        <nav
          aria-label="Archive pages"
          className="mt-6 flex max-w-4xl items-center justify-between font-mono text-xs"
        >
          {page > 1 ? (
            <Link
              href={`/archive${archiveQueryString(filters, Math.min(page - 1, lastPage))}`}
              className="text-teal-blue hover:underline"
            >
              ← Previous
            </Link>
          ) : (
            <span className="text-text-muted">← Previous</span>
          )}
          <span className="text-text-secondary">
            Page {Math.min(page, lastPage)} of {lastPage}
          </span>
          {page < lastPage ? (
            <Link
              href={`/archive${archiveQueryString(filters, page + 1)}`}
              className="text-teal-blue hover:underline"
            >
              Next →
            </Link>
          ) : (
            <span className="text-text-muted">Next →</span>
          )}
        </nav>
      ) : null}
    </section>
  );
}
