import { pageMetadata } from "@/lib/site-metadata";
import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import {
  CSV_MAX_ROWS,
  DEFAULT_RANGE_DAYS,
  JSON_DEFAULT_LIMIT,
  JSON_MAX_LIMIT,
  LICENCE_LINE,
  MAX_RANGE_DAYS,
} from "@/lib/open-data";

export const metadata = pageMetadata("/data", "Open data", "Download published events as JSON or CSV, with sources and licence.");

const EXAMPLES = [
  "/api/events",
  "/api/events?area=kaliningrad&layer=activity",
  "/api/events?type=AIR_ACTIVITY,AIRSPACE_VIOLATION&from=2026-09-10&to=2026-10-04",
  "/api/events?area=LT&limit=100",
  "/api/events.csv?from=2026-09-01&to=2026-09-30",
];

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="mt-3 grid max-w-3xl gap-3 text-base leading-relaxed text-text-secondary">{children}</div>
    </section>
  );
}

export default function DataPage() {
  return (
    <PageShell
      eyebrow="Reference"
      title="Open data"
      intro={
        <p>
          Published events are available as JSON and CSV. Every event was reviewed by a person before it was
          published, and each one keeps its sources.
        </p>
      }
    >
      <div className="grid max-w-5xl gap-6">
        <Block title="Licence">
          <p className="text-foreground">{LICENCE_LINE}</p>
          <p>
            Please credit Northeast Flank Monitor and link to the event pages. Some reporting is found through the
            GDELT Project (
            <a href="https://www.gdeltproject.org/" target="_blank" rel="noopener noreferrer" className="link">
              www.gdeltproject.org
            </a>
            ).
          </p>
        </Block>

        <Block title="Endpoints">
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              <code className="font-mono text-sm text-foreground">GET /api/events</code>: JSON with{" "}
              <code className="font-mono text-sm">data</code>, <code className="font-mono text-sm">meta</code> (count,
              filters, <code className="font-mono text-sm">next_cursor</code>) and{" "}
              <code className="font-mono text-sm">attribution</code>.
            </li>
            <li>
              <code className="font-mono text-sm text-foreground">GET /api/events.csv</code>: the same events as CSV,
              one row per event, sources joined with semicolons, and a final licence column on every row.
            </li>
          </ul>
          <p>Read-only (GET), open to any origin (CORS), cached for an hour.</p>
        </Block>

        <Block title="Filters and limits">
          <ul className="grid list-disc gap-1 pl-5">
            <li>
              <code className="font-mono text-sm">area</code>: a map area id (PL, LT, LV, EE, BY, RU-KGD, RU-W,
              BALTIC-SEA, GULF-OF-FINLAND, RU-ELSE, UA, WEST-EU, NORTH-AM, THEATER-WIDE, UNPLACED) or a name such as
              kaliningrad. Areas are assigned as on the map.
            </li>
            <li>
              <code className="font-mono text-sm">type</code>: event types, comma-separated (for example EXERCISE).
            </li>
            <li>
              <code className="font-mono text-sm">from</code> and <code className="font-mono text-sm">to</code>:
              YYYY-MM-DD. The default is the last {DEFAULT_RANGE_DAYS} days; a request may span at most{" "}
              {MAX_RANGE_DAYS} days.
            </li>
            <li>
              <code className="font-mono text-sm">layer</code>: all, activity or statements.
            </li>
            <li>
              <code className="font-mono text-sm">limit</code> and <code className="font-mono text-sm">cursor</code>:
              JSON returns {JSON_DEFAULT_LIMIT} events by default and at most {JSON_MAX_LIMIT}; pass{" "}
              <code className="font-mono text-sm">next_cursor</code> back as <code className="font-mono text-sm">cursor</code>{" "}
              for the next page. CSV returns at most {CSV_MAX_ROWS.toLocaleString("en-US")} rows; when there are more,
              the response has an X-Truncated header and an X-Next-Cursor.
            </li>
          </ul>
          <p>Any other parameter, or an invalid value, returns HTTP 400 with an explanation.</p>
          <p>Examples:</p>
          <ul className="grid gap-1">
            {EXAMPLES.map((href) => (
              <li key={href}>
                <a href={href} className="link break-all font-mono text-sm">
                  {href}
                </a>
              </li>
            ))}
          </ul>
        </Block>

        <Block title="What each event includes">
          <p>
            The fields shown on the event pages: date, headline, summary, actor, country, region, location name and
            precision, event type, exercise and unit details, reset statuses, confidence level, the contradiction flag
            and notes, the map area and layer, and a link to the event page. Each source carries its name, type, tier,
            whether it is a state or official source, the article link, its relationship (supports or contradicts),
            and a short excerpt.
          </p>
          <p>
            Never included: internal notes, reviewer names, coordinates, collected raw documents, or the article text
            read for extraction. Recent events supported only by Tier 4 sources are held back, as on the map. The
            historical record is not part of this API.
          </p>
          <p>
            Counts reflect reporting, not intensity of activity. See the{" "}
            <Link href="/methodology" className="link">
              Methodology
            </Link>{" "}
            for how events are selected and reviewed.
          </p>
        </Block>
      </div>
    </PageShell>
  );
}
