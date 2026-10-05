import { pageMetadata } from "@/lib/site-metadata";
import Link from "next/link";
import { connection } from "next/server";
import { EventLogEntry } from "@/components/event-log-entry";
import { ListFilterForm } from "@/components/list-filter-form";
import { PageShell } from "@/components/page-shell";
import { ShowMoreList } from "@/components/show-more-list";
import { COUNTS_NOTE, groupByMonth, minimumDataText, SAFETY_NOTE, weeklyCounts } from "@/lib/air-activity";
import { filterOptions, matchesFilters, parseListFilters, SHOW_STEP } from "@/lib/list-filters";
import { loadAirActivity } from "@/lib/public-air-activity";

export const metadata = pageMetadata("/air-activity", "Air Activity", "Reviewed reports of military air activity on NATO's northeastern flank, placed by area.");

export default async function AirActivityPage({ searchParams }: PageProps<"/air-activity">) {
  await connection();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const [items, params] = await Promise.all([loadAirActivity(now), searchParams]);

  const keyed = items.map((i) => ({ item: i, countries: i.event.country ? [i.event.country] : [], month: i.date.slice(0, 7) }));
  const options = filterOptions(keyed);
  const filters = parseListFilters(params, options);
  const shown = keyed.filter((k) => matchesFilters(k, filters)).map((k) => k.item);
  const months = groupByMonth(shown);
  const weekly = weeklyCounts(items, today);
  const firstDate = items.length ? [...items].map((i) => i.date).sort()[0] : null;
  const filterKey = `${filters.country ?? ""}|${filters.month ?? ""}`;

  return (
    <PageShell
      eyebrow="Monitoring"
      title="Air activity"
      intro={
        <p>
          Published events about air activity, air defence, airfields, airspace violations, drones and missiles,
          plus NATO or Russian deployments that involve aircraft, newest first. Each links to its event page with
          sources and confidence. {COUNTS_NOTE}
        </p>
      }
    >
      <div className="grid max-w-5xl gap-6">
        <p className="border-l-2 border-teal-blue pl-3 text-sm text-text-secondary">{SAFETY_NOTE}</p>

        <ListFilterForm action="/air-activity" filters={filters} countries={options.countries} months={options.months} />

        {months.length === 0 ? (
          <p className="text-sm text-text-muted">
            {items.length === 0 ? "No published air events yet." : "No published air events for this search."}
          </p>
        ) : (
          months.map((m) => (
            <section key={m.month} aria-labelledby={`month-${m.month}`} className="grid gap-3">
              <h2
                id={`month-${m.month}`}
                className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary"
              >
                {m.label}
                <span className="ml-2 font-mono text-xs font-normal text-text-muted">{m.items.length}</span>
              </h2>
              <ShowMoreList
                key={`${m.month}|${filterKey}`}
                step={SHOW_STEP}
                label={`events from ${m.label}`}
                items={m.items.map((i) => (
                  <div key={i.event.event_id}>
                    {i.category === "aircraft-deployment" ? (
                      <p className="mb-1 text-xs text-text-muted">Aircraft deployment</p>
                    ) : null}
                    <EventLogEntry event={i.event} variant="row" />
                  </div>
                ))}
              />
            </section>
          ))
        )}

        <section aria-labelledby="weekly" className="panel">
          <h2 id="weekly" className="mb-3 text-base font-semibold text-foreground">
            By week
          </h2>
          {weekly ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted">
                  <th scope="col" className="pb-2 font-medium">Week starting</th>
                  <th scope="col" className="pb-2 text-right font-medium">Events</th>
                </tr>
              </thead>
              <tbody>
                {weekly.map((w) => (
                  <tr key={w.week} className="border-t border-border">
                    <th scope="row" className="py-1.5 text-left font-mono font-normal text-text-secondary">{w.week}</th>
                    <td className="py-1.5 text-right font-mono tabular-nums">{w.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-text-secondary">{minimumDataText(items.length, firstDate)}</p>
          )}
        </section>

        <p className="text-xs text-text-muted">
          The historical record (2020–2022) is kept separately on the{" "}
          <Link href="/historical" className="link">
            Historical Comparison
          </Link>{" "}
          pages and is not included here.
        </p>
      </div>
    </PageShell>
  );
}
