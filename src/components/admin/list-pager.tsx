import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { listHref, type ListFilters, type Page } from "@/lib/list-filters";

/** "Showing 21–40 of 74" with Previous and Next links that keep the search. */
export function ListPager({
  base,
  filters,
  page,
  noun,
}: {
  base: string;
  filters: ListFilters;
  page: Page<unknown>;
  /** Plural, e.g. "events". */
  noun: string;
}) {
  if (page.total === 0) return null;
  const disabled = "pointer-events-none opacity-40";
  return (
    <nav aria-label="Pages" className="mt-4 flex flex-wrap items-center justify-between gap-3">
      <p className="text-xs text-text-muted">
        Showing {page.from}–{page.to} of {page.total} {noun}
        {page.pageCount > 1 ? ` · page ${page.page} of ${page.pageCount}` : ""}
      </p>
      {page.pageCount > 1 ? (
        <div className="flex gap-2">
          <Link
            href={listHref(base, filters, page.page - 1)}
            className={`${buttonVariants({ variant: "outline", size: "sm" })} ${page.page === 1 ? disabled : ""}`}
            aria-disabled={page.page === 1}
            tabIndex={page.page === 1 ? -1 : undefined}
            rel="prev"
          >
            ← Previous
          </Link>
          <Link
            href={listHref(base, filters, page.page + 1)}
            className={`${buttonVariants({ variant: "outline", size: "sm" })} ${page.page === page.pageCount ? disabled : ""}`}
            aria-disabled={page.page === page.pageCount}
            tabIndex={page.page === page.pageCount ? -1 : undefined}
            rel="next"
          >
            Next →
          </Link>
        </div>
      ) : null}
    </nav>
  );
}
