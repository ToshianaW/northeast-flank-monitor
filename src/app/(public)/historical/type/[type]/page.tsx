import { pageMetadata } from "@/lib/site-metadata";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { HistoricalEventCard } from "@/components/historical/historical-event-card";
import { HistoricalNotice } from "@/components/historical/historical-notice";
import { MonthStrip } from "@/components/historical/month-strip";
import { PageShell } from "@/components/page-shell";
import { EVENT_TYPE_LABELS, isStatementType } from "@/lib/event-labels";
import {
  emptyStateText,
  FULL_PERIOD,
  monthLabel,
  monthStrip,
  selectMonth,
  typeFromSlug,
} from "@/lib/historical-rules";
import { getHistoricalCoverage, getTypeMonthCounts, listPublishedByTypeMonth } from "@/lib/public-historical";

export async function generateMetadata({ params }: PageProps<"/historical/type/[type]">) {
  const { type } = await params;
  return pageMetadata(`/historical/type/${encodeURIComponent(type)}`, "Historical comparison", "Published historical events of one type, by month.");
}

export default async function HistoricalTypePage({ params, searchParams }: PageProps<"/historical/type/[type]">) {
  await connection();
  const { type: slug } = await params;
  const type = typeFromSlug(slug);
  if (!type) notFound();

  const [counts, coverage, query] = await Promise.all([
    getTypeMonthCounts(),
    getHistoricalCoverage(FULL_PERIOD),
    searchParams,
  ]);
  const strip = monthStrip(counts.filter((c) => c.event_type === type));
  const { month, invalid } = selectMonth(strip, query.month);
  if (invalid) notFound();
  const events = month ? await listPublishedByTypeMonth(type, month) : [];
  const label = EVENT_TYPE_LABELS[type];
  const basePath = `/historical/type/${slug}`;

  return (
    <PageShell
      eyebrow={`Historical record · ${isStatementType(type) ? "Statements" : "Activity"}`}
      title={label}
    >
      <div className="grid max-w-5xl gap-6">
        <Link href="/historical" className="inline-flex items-center gap-1.5 text-sm text-link hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Historical comparison
        </Link>
        <HistoricalNotice coverage={coverage} listEmptyMonths={false} />
        <MonthStrip months={strip} selected={month} basePath={basePath} />

        <section aria-labelledby="month-events" className="grid gap-3">
          <h2 id="month-events" className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
            {month ? monthLabel(month) : "No month selected"}
          </h2>
          {events.length === 0 ? (
            <p className="text-sm text-text-muted">{emptyStateText(label, month)}</p>
          ) : (
            events.map((e) => <HistoricalEventCard key={e.event_id} event={e} />)
          )}
        </section>
      </div>
    </PageShell>
  );
}
