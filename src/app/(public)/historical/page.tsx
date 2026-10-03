import Link from "next/link";
import { connection } from "next/server";
import { formatEventDate } from "@/components/event-log-entry";
import { HistoricalNotice } from "@/components/historical/historical-notice";
import { PageShell } from "@/components/page-shell";
import { CONFIDENCE_LEVEL_LABELS, EVENT_TYPE_LABELS } from "@/lib/event-labels";
import { CONFIDENCE_TONES, eventTypeTone } from "@/lib/event-tones";
import {
  FULL_PERIOD,
  monthLabel,
  monthsBetween,
  parsePeriod,
} from "@/lib/historical-rules";
import { getHistoricalCoverage, listPublishedHistorical } from "@/lib/public-historical";

export const metadata = { title: "Historical comparison" };

const ALL_MONTHS = monthsBetween(FULL_PERIOD.from, FULL_PERIOD.to);

export default async function HistoricalPage({ searchParams }: PageProps<"/historical">) {
  await connection();
  const period = parsePeriod(await searchParams);
  const [events, coverage] = await Promise.all([listPublishedHistorical(period), getHistoricalCoverage(period)]);
  const byMonth = new Map<string, typeof events>();
  for (const e of events) {
    const month = e.event_date.toISOString().slice(0, 7);
    byMonth.set(month, [...(byMonth.get(month) ?? []), e]);
  }

  return (
    <PageShell
      eyebrow="Historical record · Aug 2020 – Feb 2022"
      title="Historical comparison"
      intro={
        <p>
          Published, reviewed events from August 2020 to February 2022, the period leading up to Russia&rsquo;s
          full-scale invasion of Ukraine on 24 February 2022, grouped by month. The record exists so that
          current activity can be compared with activity in the same region during that period. Each event keeps
          its source and a short quoted excerpt. Similar activity does not mean the same outcome will follow:
          this is a baseline for comparison, not a prediction, and it is kept separate from current reporting.
        </p>
      }
    >
      <div className="grid max-w-4xl gap-6">
        <HistoricalNotice coverage={coverage} />

        <form method="get" className="flex flex-wrap items-end gap-3 text-sm" aria-label="Period">
          {(["from", "to"] as const).map((key) => (
            <label key={key} className="grid gap-1">
              <span className="text-xs text-text-muted">{key === "from" ? "From" : "To"}</span>
              <select
                name={key}
                defaultValue={period[key]}
                className="border border-border bg-surface-dark px-2 py-1.5 text-sm"
              >
                {ALL_MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <button type="submit" className="btn-pill">
            Show period
          </button>
          <Link href="/historical" className="link text-xs">
            Full period
          </Link>
        </form>

        {coverage.months.map(({ month }) => {
          const items = byMonth.get(month) ?? [];
          return (
            <section key={month} aria-labelledby={`m-${month}`} className="grid gap-3">
              <h2 id={`m-${month}`} className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
                {monthLabel(month)}
                <span className="ml-2 font-mono text-xs font-normal text-text-muted">{items.length}</span>
              </h2>
              {items.length === 0 ? (
                <p className="text-sm text-text-muted">No entries for this month yet.</p>
              ) : (
                items.map((e) => (
                  <article key={e.event_id} className="panel panel-link">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`pill tint ${eventTypeTone(e.event_type)}`}>{EVENT_TYPE_LABELS[e.event_type]}</span>
                      <span className={`pill tint ${CONFIDENCE_TONES[e.confidence_level]}`}>
                        Confidence: {CONFIDENCE_LEVEL_LABELS[e.confidence_level]}
                      </span>
                      {e.contradiction_flag ? <span className="pill tint tone-neutral">Conflicting reports</span> : null}
                    </div>
                    <h3 className="mt-3 text-base font-medium leading-snug">
                      <Link href={`/historical/${e.event_id}`} className="panel-target transition-colors hover:text-link hover:underline">
                        {e.headline}
                      </Link>
                    </h3>
                    <p className="mt-1 font-mono text-xs text-text-secondary">
                      {formatEventDate(e.event_date)}
                      {e.country ? ` · ${e.country}` : null}
                      {e.source_name ? ` · Source: ${e.source_name}` : null}
                    </p>
                    {e.summary ? <p className="mt-2 line-clamp-2 max-w-3xl text-base text-text-secondary">{e.summary}</p> : null}
                  </article>
                ))
              )}
            </section>
          );
        })}
      </div>
    </PageShell>
  );
}
