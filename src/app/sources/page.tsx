import { connection } from "next/server";
import { Badge } from "@/components/ui/badge";
import {
  isStateOfficialSource,
  SOURCE_TYPE_LABELS,
  TIER_LABELS,
} from "@/lib/source-labels";
import { listSources, type Source } from "@/lib/sources";

export const metadata = { title: "Sources" };

type Group = { key: string; title: string; sources: Source[] };

function groupByTier(sources: Source[]): Group[] {
  const groups: Group[] = ([1, 2, 3, 4] as const).map((tier) => ({
    key: `tier-${tier}`,
    title: TIER_LABELS[tier],
    sources: sources.filter((s) => s.tier === tier),
  }));
  groups.push({
    key: "tier-unassigned",
    title: "Tier not yet assigned",
    sources: sources.filter((s) => s.tier === null),
  });
  return groups.filter((group) => group.sources.length > 0);
}

export default async function SourcesPage() {
  await connection();
  const sources = await listSources();
  const groups = groupByTier(sources);

  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-10 sm:px-6">
      <p className="meta-label mb-3">Source hierarchy</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
        Sources
      </h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-text-secondary sm:text-base">
        Sources are not treated equally. Each is grouped by tier and labeled by
        type. Russian and Belarusian official sources are marked as state
        sources: their claims are reported with attribution and are not
        treated as independently verified.
      </p>

      {groups.length === 0 ? (
        <div className="mt-10 border border-dashed border-border bg-surface-dark px-6 py-10 text-center">
          <p className="text-sm text-text-secondary">
            No sources have been added to the registry yet.
          </p>
        </div>
      ) : (
        <div className="mt-10 grid gap-10">
          {groups.map((group) => (
            <section key={group.key} aria-labelledby={group.key}>
              <h2
                id={group.key}
                className="border-b border-border pb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary"
              >
                {group.title}
                <span className="ml-2 font-mono text-xs font-normal text-text-muted">
                  {group.sources.length}
                </span>
              </h2>
              <ul className="divide-y divide-border">
                {group.sources.map((source) => (
                  <li key={source.id} className="py-4">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                      {source.home_url ? (
                        <a
                          href={source.home_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-foreground hover:text-teal-blue hover:underline"
                        >
                          {source.name}
                        </a>
                      ) : (
                        <span className="font-medium">{source.name}</span>
                      )}
                      <Badge variant="outline" className="text-text-secondary">
                        {SOURCE_TYPE_LABELS[source.source_type]}
                      </Badge>
                      {isStateOfficialSource(source) ? (
                        <Badge className="bg-slate-indigo text-foreground">
                          State / official source
                        </Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 font-mono text-xs text-text-muted">
                      {[source.source_country, source.source_language]
                        .filter(Boolean)
                        .join(" · ") || "Country not recorded"}
                    </p>
                    {source.notes ? (
                      <p className="mt-2 max-w-3xl text-sm text-text-secondary">
                        {source.notes}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
