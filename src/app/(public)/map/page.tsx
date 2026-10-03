import { connection } from "next/server";
import { MapControls } from "@/components/map/map-controls";
import { MapLegend } from "@/components/map/map-legend";
import { MapView } from "@/components/map/map-view";
import { RegionTable } from "@/components/map/region-table";
import { PageShell } from "@/components/page-shell";
import { loadMapData, parseMapParams } from "@/lib/map-data";

export const metadata = { title: "Map" };

export default async function MapPage({ searchParams }: PageProps<"/map">) {
  await connection();
  const { days, layer } = parseMapParams(await searchParams);
  const data = await loadMapData({ days, layer });

  return (
    <PageShell
      eyebrow="Regional map"
      title="Regional map"
      intro={
        <p>
          Published events and exercises per area across Kaliningrad, Belarus, Poland, the
          Baltic states, the Baltic Sea and western Russia. Shading is by region only: no
          markers and no precise or current positions. Each item is placed where it concerns,
          not where it was said.
        </p>
      }
    >
      <div className="grid gap-6">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <MapControls layer={layer} days={days} />
          <MapLegend layer={layer} days={days} />
        </div>
        <MapView data={data} />
        <RegionTable data={data} />
        <p className="text-xs text-text-muted">
          Boundaries: Natural Earth (public domain), simplified. Items from the last 72 hours
          supported only by Tier 4 sources are not shown.
        </p>
      </div>
    </PageShell>
  );
}
