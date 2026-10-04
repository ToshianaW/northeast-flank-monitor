import Link from "next/link";
import { COUNTS_NOTE, monthLabel } from "@/lib/historical-rules";

type Month = { month: string; count: number };

/**
 * The 19 months of the historical period with this type's count. Months with entries are links
 * (?month=YYYY-MM); empty months are greyed text. No connecting lines, trend marks or colour
 * scale. Wraps on narrow screens. A table with the same counts follows for screen readers and
 * anyone who prefers it.
 */
export function MonthStrip({ months, selected, basePath }: { months: Month[]; selected: string | null; basePath: string }) {
  return (
    <section aria-labelledby="month-strip-heading" className="grid gap-3">
      <h2 id="month-strip-heading" className="meta-label">
        Months
      </h2>
      <nav aria-label="Months, August 2020 to February 2022">
        <ol className="flex flex-wrap gap-2">
          {months.map(({ month, count }) => {
            const label = monthLabel(month);
            const text = (
              <>
                <span className="block text-xs">{label}</span>
                <span className="block font-mono text-sm">{count}</span>
              </>
            );
            const box = "block min-w-[4.5rem] border px-2 py-1.5 text-center";
            return (
              <li key={month}>
                {count > 0 ? (
                  <Link
                    href={`${basePath}?month=${month}`}
                    aria-current={month === selected ? "page" : undefined}
                    aria-label={`${label}: ${count} ${count === 1 ? "entry" : "entries"}`}
                    className={`${box} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-blue ${
                      month === selected
                        ? "border-teal-blue bg-teal-blue/15 text-foreground"
                        : "border-border text-foreground hover:border-teal-blue"
                    }`}
                  >
                    {text}
                  </Link>
                ) : (
                  <span className={`${box} border-border/50 text-text-muted opacity-60`}>
                    {text}
                    <span className="sr-only"> (no entries)</span>
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
      <p className="text-xs text-text-muted">{COUNTS_NOTE}</p>
      <details className="text-sm">
        <summary className="cursor-pointer text-text-secondary">Counts as a table</summary>
        <table className="mt-2 w-full max-w-sm text-left">
          <caption className="sr-only">Published entries per month</caption>
          <thead>
            <tr>
              <th scope="col" className="py-1 font-medium">
                Month
              </th>
              <th scope="col" className="py-1 text-right font-medium">
                Entries
              </th>
            </tr>
          </thead>
          <tbody>
            {months.map(({ month, count }) => (
              <tr key={month} className="border-t border-border/60">
                <td className="py-1">{monthLabel(month)}</td>
                <td className="py-1 text-right font-mono">{count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </section>
  );
}
