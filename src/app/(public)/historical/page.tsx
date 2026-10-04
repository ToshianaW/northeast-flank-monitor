import Link from "next/link";
import { connection } from "next/server";
import { ContextTimeline } from "@/components/historical/context-timeline";
import { HistoricalNotice } from "@/components/historical/historical-notice";
import { PageShell } from "@/components/page-shell";
import { emptyGroupText, groupTypeSummaries, monthSpan, typeSlug, type TypeSummary } from "@/lib/historical-rules";
import { getTypeMonthCounts } from "@/lib/public-historical";
import { PRELUDE_TIMELINE } from "@/content/ukraine-prelude-timeline";

export const metadata = { title: "Historical comparison" };

function TypeCards({ id, title, summaries }: { id: "activity" | "statements"; title: string; summaries: TypeSummary[] }) {
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h2>
      {summaries.length === 0 ? (
        <p className="text-sm text-text-muted">{emptyGroupText(id)}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {summaries.map((s) => (
            <li key={s.type}>
              <Link
                href={`/historical/type/${typeSlug(s.type)}`}
                className="panel panel-link block focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-blue"
              >
                <span className="block font-medium">{s.label}</span>
                <span className="mt-1 block font-mono text-sm text-text-secondary">
                  {s.count} {s.count === 1 ? "entry" : "entries"} · {monthSpan(s.firstMonth, s.lastMonth)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default async function HistoricalPage() {
  await connection();
  const groups = groupTypeSummaries(await getTypeMonthCounts());

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
      <div className="grid max-w-5xl gap-8">
        <HistoricalNotice />
        <TypeCards id="activity" title="Activity" summaries={groups.activity} />
        <TypeCards id="statements" title="Statements" summaries={groups.statements} />
        <ContextTimeline stretches={PRELUDE_TIMELINE} />
      </div>
    </PageShell>
  );
}
