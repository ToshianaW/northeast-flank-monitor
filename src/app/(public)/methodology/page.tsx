import Link from "next/link";
import { PageShell } from "@/components/page-shell";
import { LabelHelp } from "@/components/label-help";
import {
  CONFIDENCE_LEVEL_LABELS,
  DIMENSION_STATUS_LABELS,
  DIMENSION_STATUS_VALUES,
  EVENT_TYPE_LABELS,
  EVENT_TYPE_VALUES,
  LOCATION_PRECISION_LABELS,
  RESET_STATUS_LABELS,
  RESET_STATUS_VALUES,
  type ConfidenceLevel,
  type LocationPrecision,
} from "@/lib/event-labels";
import { SOURCE_TYPE_LABELS, SOURCE_TYPE_VALUES } from "@/lib/source-labels";

export const metadata = { title: "Methodology" };

/** Spec §23, verbatim. */
const ACTIVITY_INDEX_DISCLAIMER =
  "The Northeast Flank Activity Index measures observable military activity and force posture. It does not estimate the probability of conflict or predict political intent.";

const SECTIONS = [
  { id: "core-question", title: "The core question" },
  { id: "monitoring", title: "What the site monitors" },
  { id: "sources", title: "Source hierarchy" },
  { id: "confidence", title: "Source reliability and claim confidence" },
  { id: "taxonomy", title: "Event taxonomy" },
  { id: "reset", title: "Post-exercise reset" },
  { id: "review", title: "Review process" },
  { id: "locations", title: "Location handling" },
  { id: "activity-index", title: "Activity Index" },
  { id: "historical", title: "Historical record and comparison" },
  { id: "status", title: "Current status" },
  { id: "limitations", title: "Known limitations" },
] as const;

/** Spec §36 definitions, keyed to the confidence levels used on the site. */
const CONFIDENCE_DEFINITIONS: Record<ConfidenceLevel, string> = {
  CONFIRMED: "Supported by multiple reliable sources or strong primary evidence.",
  HIGH: "Strong primary source or multiple partial confirmations.",
  MODERATE: "Credible but incomplete evidence.",
  UNVERIFIED: "Insufficient independent confirmation.",
};

const PRECISION_DEFINITIONS: Record<LocationPrecision, string> = {
  EXACT: "A specific place named by the source.",
  BASE: "A publicly known base, garrison, or installation.",
  DISTRICT: "A district or similar local administrative area.",
  REGION: "A region, oblast, or wider area.",
};

/** Spec §1 primary focus. */
const REGIONS = [
  "Kaliningrad Oblast",
  "Western Belarus",
  "Suwałki corridor",
  "Lithuania",
  "Poland",
  "Latvia",
  "Estonia",
  "Baltic Sea region",
  "Relevant areas of western Russia when activity materially affects the Baltic theater",
];

/** Spec §7, per area. */
const REGION_DETAIL: Array<{ name: string; items: string }> = [
  {
    name: "Belarus",
    items:
      "Grodno / Hrodna Oblast, Brest Oblast, Western Operational Command, training grounds near NATO borders, airfields, rail corridors, territorial defense, mobilization, reserve activity, Russian military presence, joint Russian-Belarusian activity.",
  },
  {
    name: "Kaliningrad Oblast",
    items:
      "Baltic Fleet, ground formations, air-defense systems, missile forces, aviation, Iskander-related activity, electronic warfare, naval activity, military rail movements, infrastructure, reinforcement from mainland Russia, changes in force posture.",
  },
  {
    name: "Lithuania",
    items:
      "Lithuanian Armed Forces, Lithuanian Ministry of National Defence, NATO forces, German brigade, U.S. rotational forces, Baltic Air Policing, exercises, mobilization, territorial defense, airspace incidents, border activity.",
  },
  {
    name: "Poland",
    items:
      "Polish Armed Forces, Ministry of National Defence, Operational Command, northeastern Poland, Suwałki corridor, exercises, NATO deployments, U.S. forces, border security, mobilization/readiness activity.",
  },
  {
    name: "Latvia and Estonia",
    items:
      "National armed forces, NATO deployments, air defense, exercises, border incidents, readiness changes, Russian military activity affecting their territory.",
  },
  {
    name: "Western Russia",
    items:
      "Tracked only when relevant to the Baltic / Belarus theater: Russian formations moving west, Western Military District / successor command activity, rail deployments, aviation movements, logistics support, reinforcements toward Belarus or Kaliningrad.",
  },
];

/** Spec §2 observable behavior. */
const INDICATORS = [
  "exercise frequency",
  "exercise geography",
  "readiness inspections",
  "mobilization",
  "reserve activation",
  "troop movements",
  "unit rotations",
  "equipment movements",
  "air activity",
  "logistics",
  "rail activity",
  "engineering activity",
  "airfield preparation",
  "command-and-control activity",
  "air defense activity",
  "electronic warfare",
  "border incidents",
  "NATO reinforcement",
  "Russian-Belarusian military integration",
  "whether forces return after exercises",
  "whether equipment remains",
  "whether temporary infrastructure remains",
  "whether new exercises replace previous ones",
];

/** Spec §§26–29. */
const TIERS: Array<{ title: string; body: React.ReactNode }> = [
  {
    title: "Tier 1 — Official primary sources",
    body: (
      <ul className="mt-2 grid gap-1">
        <li>
          <span className="text-foreground">Lithuania:</span> Ministry of National
          Defence, Lithuanian Armed Forces, State Border Guard Service, VSD threat
          assessments.
        </li>
        <li>
          <span className="text-foreground">Poland:</span> Ministry of National
          Defence, Polish Armed Forces Operational Command, Government Security
          Centre, Border Guard.
        </li>
        <li>
          <span className="text-foreground">Latvia / Estonia:</span> defense
          ministries, armed forces, border authorities, national intelligence
          threat assessments.
        </li>
        <li>
          <span className="text-foreground">NATO:</span> NATO, SHAPE, Allied Air
          Command, NATO battlegroups.
        </li>
        <li>
          <span className="text-foreground">Russia / Belarus:</span> Russian
          Ministry of Defence, Belarusian Ministry of Defence, Baltic Fleet,
          official regional statements.
        </li>
      </ul>
    ),
  },
  {
    title: "Tier 2 — Independent analytical sources",
    body: <p className="mt-2">OSW, iSANS, ISW, RUSI, IISS, CSIS, CEPA, Chatham House.</p>,
  },
  {
    title: "Tier 3 — Major journalism",
    body: (
      <p className="mt-2">
        Reuters, AP, BBC, major Baltic outlets, major Polish outlets, major
        Lithuanian outlets.
      </p>
    ),
  },
  {
    title: "Tier 4 — OSINT",
    body: (
      <p className="mt-2">
        Vetted accounts and communities only. Preference goes to OSINT supported
        by imagery, geolocation, satellite evidence, flight tracking, rail
        tracking, or other reproducible public evidence. Anonymous Telegram,
        Discord, Reddit, or X claims are not published as verified facts; they
        are used as leads.
      </p>
    ),
  },
];

function Section({
  id,
  number,
  title,
  children,
}: {
  id: string;
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="panel scroll-mt-20">
      <h2 className="text-lg font-semibold tracking-tight">
        <span className="mr-3 font-mono text-xs text-text-muted">
          {String(number).padStart(2, "0")}
        </span>
        {title}
      </h2>
      <div className="mt-3 grid max-w-3xl gap-3 text-base leading-relaxed text-text-secondary">
        {children}
      </div>
    </section>
  );
}

function Subhead({ children }: { children: React.ReactNode }) {
  return <h3 className="meta-label mt-2">{children}</h3>;
}

function Planned() {
  return (
    <span className="ml-2 inline-block border border-slate-indigo px-1.5 py-0.5 align-middle font-mono text-[0.65rem] tracking-wide text-text-secondary uppercase">
      Planned
    </span>
  );
}

export default function MethodologyPage() {
  const n = (id: (typeof SECTIONS)[number]["id"]) =>
    SECTIONS.findIndex((s) => s.id === id) + 1;
  const t = (id: (typeof SECTIONS)[number]["id"]) =>
    SECTIONS.find((s) => s.id === id)!.title;

  return (
    <PageShell
      eyebrow="Open methodology"
      title="Methodology"
      intro={
        <p>
          How Northeast Flank Monitor selects, labels, reviews, and presents
          events, and what it does not claim.
        </p>
      }
      aside={
        <nav
          aria-label="Contents"
          className="panel lg:sticky lg:top-20"
        >
          <p className="meta-label mb-3">Contents</p>
          <ol className="grid gap-1.5 text-base sm:grid-cols-2 lg:grid-cols-1">
            {SECTIONS.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="link">
                  <span className="mr-2 font-mono text-xs text-text-muted">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {s.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      }
      asideFirstOnMobile
    >
      <div className="grid gap-6">
        <Section id="core-question" number={n("core-question")} title={t("core-question")}>
          <p className="text-lg font-medium text-foreground">
            Is the regional military baseline changing?
          </p>
          <p className="font-medium text-foreground">
            Observe behavior. Track the baseline. Compare historically. Do not
            predict intent.
          </p>
          <p>
            The core purpose is not to predict war. The project is built around
            observable military behavior rather than assumptions about intent.
            It aims to make it possible to distinguish:
          </p>
          <ul className="list-disc pl-5">
            <li>routine military activity</li>
            <li>elevated readiness</li>
            <li>temporary exercises</li>
            <li>sustained readiness cycles</li>
            <li>force accumulation</li>
            <li>incomplete post-exercise reset</li>
            <li>changes in military posture</li>
          </ul>
          <p>Similarity is not trajectory.</p>
        </Section>

        <Section id="monitoring" number={n("monitoring")} title={t("monitoring")}>
          <Subhead>Regions</Subhead>
          <ul className="list-disc pl-5">
            {REGIONS.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <dl className="grid gap-3">
            {REGION_DETAIL.map((r) => (
              <div key={r.name}>
                <dt className="text-foreground">{r.name}</dt>
                <dd>{r.items}</dd>
              </div>
            ))}
          </dl>
          <Subhead>Indicators</Subhead>
          <p>The site monitors what actors are observably doing, including:</p>
          <ul className="grid list-disc gap-x-8 pl-5 sm:grid-cols-2">
            {INDICATORS.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </Section>

        <Section id="sources" number={n("sources")} title={t("sources")}>
          <p>
            Sources are not treated equally. Each source in the registry is
            assigned a tier and a source type, both shown on the{" "}
            <Link href="/sources" className="link">
              Sources
            </Link>{" "}
            page.
          </p>
          {TIERS.map((tier) => (
            <div key={tier.title}>
              <p className="text-foreground">{tier.title}</p>
              {tier.body}
            </div>
          ))}
          <div className="border border-slate-indigo/60 bg-surface-raised px-4 py-3">
            <p className="meta-label mb-1">State / official sources</p>
            <p>
              Official Russian and Belarusian sources are labeled &ldquo;State /
              official source&rdquo;. Their claims are reported with attribution
              and are not treated as independently verified.
            </p>
          </div>
          <Subhead>Source types</Subhead>
          <p>{SOURCE_TYPE_VALUES.map((v) => SOURCE_TYPE_LABELS[v]).join(" · ")}</p>
          <Subhead>How sources are read</Subhead>
          <p>
            For some sources the full article page is read to extract events.
            Only our own summary, an excerpt of 20 words or fewer, and a link to
            the original are stored with an event or shown on this site; the
            article text read for extraction is kept privately and never
            published. Sources whose terms or robots.txt prohibit this are not
            read.
          </p>
        </Section>

        <Section id="confidence" number={n("confidence")} title={t("confidence")}>
          <LabelHelp className="border-l-2 border-teal-blue pl-3" />
          <p>These are two separate ratings.</p>
          <p>
            <span className="text-foreground">Source reliability</span> is a
            standing rating of an outlet as a whole: High, Medium, Low, or
            Unrated. It says nothing on its own about any single claim.
          </p>
          <p>
            <span className="text-foreground">Claim confidence</span> is set for
            each event and describes how well that event is supported by the
            evidence attached to it. A reliable outlet can still report a claim
            that is unverified.
          </p>
          <dl className="grid gap-3">
            {(Object.keys(CONFIDENCE_DEFINITIONS) as ConfidenceLevel[]).map((level) => (
              <div key={level} className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt className="font-mono text-xs uppercase tracking-wide text-foreground sm:pt-1">
                  {CONFIDENCE_LEVEL_LABELS[level]}
                </dt>
                <dd>{CONFIDENCE_DEFINITIONS[level]}</dd>
              </div>
            ))}
          </dl>
          <p>Speculative claims are not presented as established facts.</p>
        </Section>

        <Section id="taxonomy" number={n("taxonomy")} title={t("taxonomy")}>
          <p>
            Every event is assigned one of {EVENT_TYPE_VALUES.length} types from
            a controlled taxonomy.
          </p>
          <ul className="grid list-disc gap-x-8 pl-5 sm:grid-cols-2">
            {EVENT_TYPE_VALUES.map((v) => (
              <li key={v}>{EVENT_TYPE_LABELS[v]}</li>
            ))}
          </ul>
        </Section>

        <Section id="reset" number={n("reset")} title={t("reset")}>
          <p>For each significant exercise, the site tracks:</p>
          <ul className="list-disc pl-5">
            <li>Did personnel return to permanent bases?</li>
            <li>Did equipment return?</li>
            <li>Was temporary infrastructure removed?</li>
            <li>Were airfields returned to normal activity?</li>
            <li>Did ammunition/logistics support disappear?</li>
            <li>Did another formation replace the previous one?</li>
            <li>Did Russian personnel remain in Belarus?</li>
            <li>Did the exercise roll directly into another readiness event?</li>
            <li>Did the overall theater return to its prior baseline?</li>
          </ul>
          <p className="border-l-2 border-teal-blue pl-3 text-foreground">
            &ldquo;Troops returned&rdquo; does not automatically mean &ldquo;the
            theater reset.&rdquo;
          </p>
          <p>
            For that reason, personnel, equipment, and temporary infrastructure
            are recorded separately, alongside any follow-on activity and an
            overall reset status.
          </p>
          <Subhead>Dimensions</Subhead>
          <p>
            Personnel, Equipment, and Temporary infrastructure each take one of:{" "}
            {DIMENSION_STATUS_VALUES.map((v) => DIMENSION_STATUS_LABELS[v]).join(", ")}.
            Follow-on activity is recorded as a short description.
          </p>
          <Subhead>Overall reset status</Subhead>
          <ul className="grid list-disc gap-x-8 pl-5 sm:grid-cols-2">
            {RESET_STATUS_VALUES.map((v) => (
              <li key={v}>{RESET_STATUS_LABELS[v]}</li>
            ))}
          </ul>
          <Subhead>Evidence rule</Subhead>
          <p>
            Every reset field starts as Unknown, shown as &ldquo;Not enough
            open-source evidence&rdquo;. A reviewer can change a field only when
            the exercise has evidence for it. That means either an attached source
            whose quoted excerpt supports it, or a linked published event dated on or after
            the exercise&rsquo;s end. The observed end date is used, or the
            announced end date if no end has been observed. Events from during the
            exercise do not count. Full reset is allowed only when personnel,
            equipment and temporary infrastructure are each recorded as Returned or
            Removed. Statuses never change on their own when a date passes. If an
            announced end date has passed with no end reported, the site says so.
          </p>
          <p>
            Where an exercise overlaps or leads into another, the follow-on
            activity field records the connection; reset fields describe only what
            sources say about that exercise&rsquo;s own units.
          </p>
        </Section>

        <Section id="review" number={n("review")} title={t("review")}>
          <p>
            Every published event has been reviewed by a person before it
            appears on the site. An event cannot be published unless at least
            one attached source supports it.
          </p>
          <p>
            When sources disagree, the event is flagged, both sources are kept,
            and the conflicting report is shown on the event page. The site does
            not force a conclusion the sources do not support.
          </p>
        </Section>

        <Section id="locations" number={n("locations")} title={t("locations")}>
          <p>
            Locations are shown as reported by sources, with a precision label.
            The site does not infer positions that no source states. Raw
            coordinates are not shown on public event pages.
          </p>
          <dl className="grid gap-2">
            {(Object.keys(PRECISION_DEFINITIONS) as LocationPrecision[]).map((p) => (
              <div key={p} className="grid gap-0.5 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt className="font-mono text-xs uppercase tracking-wide text-foreground sm:pt-1">
                  {LOCATION_PRECISION_LABELS[p]}
                </dt>
                <dd>{PRECISION_DEFINITIONS[p]}</dd>
              </div>
            ))}
          </dl>
          <Subhead>Operational security</Subhead>
          <p>
            The site does not publish sensitive real-time tactical information
            that could create operational security risks. It prefers already
            public official information, delayed data, generalized locations,
            publicly known installations, historical movements, and post-event
            analysis. It is not a real-time tactical targeting tool.
          </p>
        </Section>

        <Section id="activity-index" number={n("activity-index")} title={t("activity-index")}>
          <p className="text-foreground">Not yet calculated.</p>
          <p className="border border-border bg-surface-dark px-4 py-3">
            {ACTIVITY_INDEX_DISCLAIMER}
          </p>
          <p>
            The Index will not be introduced until enough historical and
            contemporary data exists to create a defensible baseline. Its
            scoring formula will be publicly documented and open source.
          </p>
        </Section>

        <Section id="historical" number={n("historical")} title={t("historical")}>
          <Subhead>Historical record</Subhead>
          <p>
            The{" "}
            <Link href="/historical" className="link">
              historical record
            </Link>{" "}
            covers August 2020 – February 2022. It is kept separate from current
            reporting: historical events never appear in Latest, the Archive, the
            map or the dashboard. The daily digest&rsquo;s Historical Context
            section states only how many historical events of each of the day&rsquo;s
            event types were recorded, and in which months. That section is written
            by code, not by AI.
          </p>
          <p>
            Each historical event is entered and reviewed by a person before it is
            published. It follows the same evidence rules as current events: every
            claim is attributed to its source, each source carries a short quoted
            excerpt (20 words or fewer) and a link, and predictive language is not
            used. An event supported only by Tier 4 sources is not published.
          </p>
          <p>
            The record is a baseline for comparison, not a prediction. Every
            historical page states how many events and sources it holds and which
            months have no entries yet, so a thin record is not mistaken for a
            complete one.
          </p>
          <Subhead>Side-by-side view</Subhead>
          <p>
            The{" "}
            <Link href="/historical/compare" className="link">
              side-by-side view
            </Link>{" "}
            lists published events from a chosen window of the historical record
            next to published events from a chosen window of current reporting,
            grouped by event type, with a count for each. It is descriptive only.
            It assigns no phase, score or trend, and it implies no outcome.
          </p>
          <p>
            The two sides are collected differently. Historical entries are entered
            by hand from archived reporting. Current events are collected
            automatically from monitored sources and published only after a person
            reviews them. The sources differ too, so the counts on the two sides are
            not on the same scale, and both reflect reporting, not intensity of
            activity. The page states each side&rsquo;s events, sources and months.
            It does not show the rows when the historical window holds fewer than
            4 events or 2 sources.
          </p>
          <Subhead>Historical references on event pages</Subhead>
          <p>
            A published event page can list up to three published entries from the
            historical record under &ldquo;Historical record: similar in nature&rdquo;.
            The page states only the attributes the two share, from a fixed list:
            same event type, same country, same actor, same kind of activity. Most
            links are made automatically by code when an event is published: entries
            with the same event type and the same country, preferring the same actor,
            then entries linked least often so the same few do not appear everywhere.
            These are marked &ldquo;Linked automatically by event type and country.&rdquo;
            A reviewer can remove any link, and a removed link is not added again.
            Other links are approved by a named reviewer. Event type, country and actor
            are checked against both entries in code. An entry is shown only while
            both events are published. A historical headline is shown only if it
            passes the same wording check as the rest of the page; otherwise the
            entry&rsquo;s date, type and a link are shown instead. Every reference
            ends with the same caveat: similarity in nature does not mean the same
            outcome will follow.
          </p>
          <p className="border-l-2 border-teal-blue pl-3 text-foreground">
            Similar historical behavior does not imply identical future outcomes.
          </p>
        </Section>

        <Section id="status" number={n("status")} title={t("status")}>
          <Subhead>Now</Subhead>
          <ul className="list-disc pl-5">
            <li>
              Sources are collected automatically every 4 hours. Every event is
              reviewed by a person before it is published.
            </li>
            <li>
              Events are extracted from collected reporting with AI assistance or
              entered manually. AI-extracted events are drafts only and are never
              published without human review.
            </li>
            <li>
              Possible duplicate events are flagged for the reviewer, who decides
              whether to merge them. Nothing is merged automatically.
            </li>
            <li>Sources are kept in a registry with tier, type, and reliability.</li>
            <li>
              The review form shows a rule-based confidence suggestion based on the
              sources attached to an event. It is not AI, and the reviewer makes
              the final choice.
            </li>
            <li>
              The daily digest is drafted with AI assistance from published events,
              then edited and approved by a person.
            </li>
            <li>
              The exercise tracker records announced and observed exercises with
              their post-exercise reset status, entered and reviewed by a person.
            </li>
            <li>Published events can be browsed in Latest and the Archive.</li>
            <li>
              A separate historical record (August 2020 – February 2022) is being
              built, entered and reviewed by a person. It is a baseline for
              comparison, not a prediction.
            </li>
            <li>
              The side-by-side view lists published historical and current events
              by event type for two chosen windows, with coverage notes. It is
              descriptive only.
            </li>
            <li>
              The regional map shows one dot per area with published activity in the
              chosen layer and window. Each dot marks an area, not a location: it sits
              at a fixed point chosen in advance for that area, away from towns and
              military sites, and only its size and colour change, in three steps on an
              amber-to-orange heat scale. The colour shows how much has been reported,
              not how intense the activity is, and the legend says so. No event
              positions are drawn. Items are placed by the place they concern, not
              where something was said; items about Russia elsewhere, Ukraine, Western
              Europe or North America are counted in cards beside the map. Counts
              reflect reporting, not intensity of activity.
            </li>
          </ul>
          <Subhead>
            Planned
            <Planned />
          </Subhead>
          <ul className="list-disc pl-5">
            <li>Air activity page</li>
            <li>Northeast Flank Activity Index</li>
            <li>Open data: downloadable datasets and a read-only API</li>
          </ul>
          <div className="border border-border bg-surface-dark px-4 py-3">
            <p className="meta-label mb-2">AI disclosure</p>
            <div className="grid gap-2">
              <p>
                Digests are compiled every 24 hours with AI assistance under a
                fixed procedure: collection of recent reporting, structured
                event extraction, duplicate detection, a curated source registry with tier and reliability
                labels assigned by the reviewer, and editorial review. A digest
                is drafted only from events a reviewer has already published,
                and each sentence links to the events it rests on.
              </p>
              <p>
                AI does not independently determine whether claims are true.
                Source provenance and supporting evidence remain attached to
                every published event.
              </p>
              <p>
                Historical comparisons are descriptive. They show counts of
                recorded events by type and period. The AI does not write them,
                and they imply no outcome.
              </p>
              <p>
                Historical references on event pages are linked by code without
                AI. An optional AI step, switched off by default, can only suggest
                entries from the historical record; a person approves each one,
                such links say &ldquo;AI-suggested, reviewer-approved&rdquo;, and the
                AI writes no public text.
              </p>
            </div>
          </div>
        </Section>

        <Section id="limitations" number={n("limitations")} title={t("limitations")}>
          <ul className="grid list-disc gap-2 pl-5">
            <li>
              The site counts what sources report, not everything that happens.
              Event counts depend on which sources are covered and on how often
              and how fully they report.
            </li>
            <li>
              Many post-exercise reset fields will be marked unknown or not
              verified. Equipment and temporary infrastructure can rarely be
              verified from open sources.
            </li>
            <li>
              Official statements from state sources are shown as claims made by
              those sources, not as verified facts.
            </li>
            <li>
              The dataset is small and still growing, so patterns over time
              should be read with caution.
            </li>
          </ul>
        </Section>
      </div>
    </PageShell>
  );
}
