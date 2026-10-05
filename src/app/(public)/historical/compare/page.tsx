import { pageMetadata } from "@/lib/site-metadata";
import Link from "next/link";
import { connection } from "next/server";
import { ArrowLeft } from "lucide-react";
import { formatEventDate } from "@/components/event-log-entry";
import { PageShell } from "@/components/page-shell";
import { Button } from "@/components/ui/button";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  compareRows,
  coversText,
  CURRENT_FLOOR_NOTE,
  CURRENT_METHOD_NOTE,
  currentCoverageNote,
  currentMonthOptions,
  hasEnoughHistorical,
  HISTORICAL_METHOD_NOTE,
  historicalMonthOptions,
  historicalShiftLinks,
  HOW_TO_READ,
  LENGTH_OPTIONS,
  lengthLabel,
  showingText,
  windowMonths,
  type ShiftLink,
  NONE_IN_WINDOW,
  otherTypesText,
  parseCompareWindows,
  SCALE_NOTE,
  SIMILARITY_CAVEAT,
  tooFewText,
  toCoverage,
  windowLabel,
  windowLengthNote,
  type CompareRow,
} from "@/lib/historical-compare";
import {
  coverageNote,
  HISTORICAL_LABEL,
  lastDayOf,
  monthLabel,
  type HistoricalPeriod,
} from "@/lib/historical-rules";
import { getPublishedCoverage, listPublishedEventsBetween, type PublicEvent } from "@/lib/public-events";
import { getHistoricalCoverage, listPublishedHistorical, type PublicHistoricalEvent } from "@/lib/public-historical";

export const metadata = pageMetadata("/historical/compare", "Side-by-side view", "Current and historical events side by side for two periods of the same length.");

type Row = CompareRow<PublicHistoricalEvent, PublicEvent>;

/** Earlier / Later on the historical side: plain links, or a disabled control at an end of the record. */
function ShiftControl({ link }: { link: ShiftLink }) {
  const text = link.direction === "earlier" ? "← Earlier" : "Later →";
  const base = "inline-flex h-8 items-center rounded-lg border px-3 text-sm";
  if (link.disabled) {
    return (
      <span role="link" aria-disabled="true" aria-label={link.label} className={`${base} cursor-not-allowed border-border text-text-muted opacity-60`}>
        {text}
      </span>
    );
  }
  return (
    <Link
      href={link.href}
      aria-label={link.label}
      className={`${base} border-input text-foreground hover:bg-surface-raised focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-blue`}
    >
      {text}
    </Link>
  );
}

function MonthSelect({ name, label, value, options }: { name: string; label: string; value: string; options: string[] }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={`w-${name}`} className="meta-label">
        {label}
      </label>
      <NativeSelect id={`w-${name}`} name={name} defaultValue={value} className="w-full">
        {options.map((m) => (
          <NativeSelectOption key={m} value={m}>
            {monthLabel(m)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

function LengthSelect({ name, value }: { name: string; value: number }) {
  return (
    <div className="grid gap-1">
      <label htmlFor={`w-${name}`} className="meta-label">
        Length
      </label>
      <NativeSelect id={`w-${name}`} name={name} defaultValue={String(value)} className="w-full">
        {LENGTH_OPTIONS.map((n) => (
          <NativeSelectOption key={n} value={String(n)}>
            {lengthLabel(n)}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

/** The range actually shown, and why it differs from the request when it does. */
function WindowRange({ period, note }: { period: HistoricalPeriod; note: string | null }) {
  return (
    <div className="col-span-2 grid gap-0.5 text-sm">
      <p className="font-mono text-foreground">{showingText(period)}</p>
      {note ? <p className="text-xs text-text-secondary">{note}</p> : null}
    </div>
  );
}

/** One side of a row: a count and the linked list, or the empty-window line. */
function Side({
  kind,
  period,
  items,
}: {
  kind: "historical" | "current";
  period: string;
  items: Array<{ id: string; date: Date; headline: string }>;
}) {
  const base = kind === "historical" ? "/historical" : "/events";
  return (
    <div className="grid content-start gap-2">
      <p className="meta-label">
        {kind === "historical" ? "Historical" : "Current"} · {period} ·{" "}
        <span className="font-mono">{items.length}</span> published
      </p>
      {items.length === 0 ? (
        <p className="text-sm text-text-muted">{NONE_IN_WINDOW}</p>
      ) : (
        <ul className="grid gap-1.5">
          {items.map((e) => (
            <li key={e.id} className="text-sm leading-snug">
              <span className="mr-2 font-mono text-xs text-text-secondary">{formatEventDate(e.date)}</span>
              <Link href={`${base}/${e.id}`} className="link">
                {e.headline}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RowGroup({ id, title, rows, windows }: { id: string; title: string; rows: Row[]; windows: [string, string] }) {
  if (rows.length === 0) return null;
  return (
    <section aria-labelledby={id} className="grid gap-3">
      <h2 id={id} className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary">
        {title}
      </h2>
      {rows.map((r) => (
        <article key={r.type} aria-label={r.label} className="panel grid gap-4">
          <h3 className="font-medium">{r.label}</h3>
          <div className="grid gap-5 sm:grid-cols-2">
            <Side
              kind="historical"
              period={windows[0]}
              items={r.historical.map((e) => ({ id: e.event_id, date: e.event_date, headline: e.headline }))}
            />
            <Side
              kind="current"
              period={windows[1]}
              items={r.current.map((e) => ({ id: e.event_id, date: e.event_date, headline: e.headline }))}
            />
          </div>
        </article>
      ))}
    </section>
  );
}

export default async function ComparePage({ searchParams }: PageProps<"/historical/compare">) {
  await connection();
  const now = new Date();
  const windows = parseCompareWindows(await searchParams, now);
  const { historical: hp, current: cp } = windows;
  const [historicalCoverage, historicalEvents, currentRaw, currentEvents] = await Promise.all([
    getHistoricalCoverage(hp),
    listPublishedHistorical(hp),
    getPublishedCoverage(`${cp.from}-01`, lastDayOf(cp.to)),
    listPublishedEventsBetween(`${cp.from}-01`, lastDayOf(cp.to)),
  ]);
  const currentCoverage = toCoverage(currentRaw, cp);
  const enough = hasEnoughHistorical(historicalCoverage);
  const rows = enough ? compareRows(historicalEvents, currentEvents) : null;
  const labels: [string, string] = [windowLabel(hp), windowLabel(cp)];
  const lengthNote = windowLengthNote(windows);
  const shiftLinks = historicalShiftLinks(windows);

  return (
    <PageShell
      eyebrow={`Historical record ${labels[0]} · Current reporting ${labels[1]}`}
      title="Side-by-side view"
      intro={
        <p>
          Published events from a window of the historical record next to published events from a window of current
          reporting, grouped by event type, as counts and lists. It describes what was reported in each window and
          nothing more.
        </p>
      }
    >
      <div className="grid max-w-5xl gap-8">
        <Link href="/historical" className="inline-flex items-center gap-1.5 text-sm text-link hover:underline">
          <ArrowLeft className="size-4" aria-hidden />
          Historical comparison
        </Link>

        <section aria-labelledby="how-to-read" className="panel grid gap-2">
          <h2 id="how-to-read" className="font-medium text-foreground">
            How to read this page
          </h2>
          <ol className="grid list-[lower-alpha] gap-1.5 pl-5 text-sm text-text-secondary">
            {HOW_TO_READ.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ol>
        </section>

        <form method="get" action="/historical/compare" className="panel grid gap-4 p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-2 text-sm font-medium">Historical window</legend>
              <MonthSelect name="hfrom" label="From" value={hp.from} options={historicalMonthOptions()} />
              <LengthSelect name="hlen" value={windowMonths(hp)} />
              <WindowRange period={hp} note={windows.notes.historical} />
            </fieldset>
            <fieldset className="grid grid-cols-2 gap-3">
              <legend className="mb-2 text-sm font-medium">Current window</legend>
              <p className="col-span-2 -mt-1 text-xs text-text-secondary">{CURRENT_FLOOR_NOTE}</p>
              <MonthSelect name="cfrom" label="From" value={cp.from} options={currentMonthOptions(now)} />
              <LengthSelect name="clen" value={windowMonths(cp)} />
              <WindowRange period={cp} note={windows.notes.current} />
            </fieldset>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <Button type="submit">Show</Button>
            <p className="text-xs text-text-secondary">Each window covers 1 to 6 months.</p>
          </div>
        </form>

        <nav aria-label="Move the historical window" className="flex flex-wrap items-center gap-3">
          <span className="meta-label">Historical window</span>
          <ShiftControl link={shiftLinks[0]} />
          <span className="font-mono text-sm">{labels[0]}</span>
          <ShiftControl link={shiftLinks[1]} />
          <span className="text-xs text-text-secondary">Moves by the window&rsquo;s own length; the current window stays.</span>
        </nav>

        <section aria-labelledby="notes" className="grid gap-3 border-l-2 border-teal-blue bg-surface-dark px-4 py-3">
          <h2 id="notes" className="font-medium text-foreground">
            Coverage and comparability
          </h2>
          <ul className="grid list-disc gap-1.5 pl-5 text-sm text-text-secondary">
            <li>
              <span className="text-foreground">Historical, {labels[0]}:</span> {coversText(hp)}{" "}
              {coverageNote(historicalCoverage)} {HISTORICAL_METHOD_NOTE} {HISTORICAL_LABEL}
            </li>
            <li>
              <span className="text-foreground">Current, {labels[1]}:</span> {coversText(cp)}{" "}
              {currentCoverageNote(currentCoverage, now)} {CURRENT_METHOD_NOTE}
            </li>
            <li>{SCALE_NOTE}</li>
            {lengthNote ? <li>{lengthNote}</li> : null}
            <li className="text-foreground">{SIMILARITY_CAVEAT}</li>
          </ul>
        </section>

        {rows === null ? (
          <p role="status" className="panel text-base text-text-secondary">
            {tooFewText(historicalCoverage, hp)}
          </p>
        ) : (
          <>
            <RowGroup id="activity" title="Activity" rows={rows.activity} windows={labels} />
            <RowGroup id="statements" title="Statements" rows={rows.statements} windows={labels} />
            {rows.emptyTypeCount > 0 ? (
              <p className="text-sm text-text-muted">{otherTypesText(rows.emptyTypeCount)}</p>
            ) : null}
          </>
        )}
      </div>
    </PageShell>
  );
}
