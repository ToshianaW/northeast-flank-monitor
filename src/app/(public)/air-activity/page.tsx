import Link from "next/link";
import { connection } from "next/server";
import { EventLogEntry } from "@/components/event-log-entry";
import { PageShell } from "@/components/page-shell";
import {
  COUNTS_NOTE,
  countsByArea,
  countsByType,
  groupByMonthAndArea,
  minimumDataText,
  SAFETY_NOTE,
  weeklyCounts,
} from "@/lib/air-activity";
import { loadAirActivity } from "@/lib/public-air-activity";

export const metadata = { title: "Air Activity" };

function Panel({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="panel">
      <h2 id={id} className="mb-3 text-base font-semibold text-foreground">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function AirActivityPage() {
  await connection();
  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const items = await loadAirActivity(now);
  const byType = countsByType(items, today);
  const byArea = countsByArea(items);
  const months = groupByMonthAndArea(items);
  const weekly = weeklyCounts(items, today);
  const firstDate = items.length ? [...items].map((i) => i.date).sort()[0] : null;

  return (
    <PageShell
      eyebrow="Monitoring"
      title="Air activity"
      intro={
        <p>
          Published events about air activity, air defence, airfields, airspace violations, drones and missiles,
          plus NATO or Russian deployments that involve aircraft, grouped by month and area. Each links to its event
          page with sources and confidence. {COUNTS_NOTE}
        </p>
      }
    >
      <div className="grid max-w-5xl gap-6">
        <p className="border-l-2 border-teal-blue pl-3 text-sm text-text-secondary">{SAFETY_NOTE}</p>

        <div className="grid gap-6 md:grid-cols-2">
          <Panel id="by-type" title="Events by type">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-text-muted">
                  <th scope="col" className="pb-2 font-medium">Type</th>
                  <th scope="col" className="pb-2 text-right font-medium">Last 30 days</th>
                  <th scope="col" className="pb-2 text-right font-medium">All</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((r) => (
                  <tr key={r.type} className="border-t border-border">
                    <th scope="row" className="py-1.5 text-left font-normal text-text-secondary">{r.label}</th>
                    <td className="py-1.5 text-right font-mono tabular-nums">{r.last30}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums">{r.all}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>

          <Panel id="by-area" title="Events by area">
            {byArea.length === 0 ? (
              <p className="text-sm text-text-muted">No published air events yet.</p>
            ) : (
              <table className="w-full text-sm">
                <tbody>
                  {byArea.map((a) => (
                    <tr key={a.area} className="border-t border-border first:border-t-0">
                      <th scope="row" className="py-1.5 text-left font-normal text-text-secondary">{a.label}</th>
                      <td className="py-1.5 text-right font-mono tabular-nums">{a.count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="mt-3 text-xs text-text-muted">
              Areas as on the{" "}
              <Link href="/map" className="link">
                map
              </Link>
              . {COUNTS_NOTE}
            </p>
          </Panel>
        </div>

        <Panel id="weekly" title="By week">
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
        </Panel>

        {months.map((m) => (
          <section key={m.month} aria-labelledby={`month-${m.month}`} className="grid gap-3">
            <h2
              id={`month-${m.month}`}
              className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary"
            >
              {m.label}
            </h2>
            {m.areas.map((a) => (
              <div key={a.area} className="grid gap-2">
                <h3 className="meta-label">{a.label}</h3>
                <div className="grid gap-2">
                  {a.items.map((i) => (
                    <div key={i.event.event_id}>
                      {i.category === "aircraft-deployment" ? (
                        <p className="mb-1 text-xs text-text-muted">Aircraft deployment</p>
                      ) : null}
                      <EventLogEntry event={i.event} variant="row" />
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
        {months.length === 0 ? <p className="text-sm text-text-muted">No published air events yet.</p> : null}

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
