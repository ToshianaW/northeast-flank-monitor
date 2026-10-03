import Link from "next/link";
import type { MapData } from "@/lib/map-data";
import type { RegionFeatureCollection } from "@/lib/placement";
import { OUTLINE_COLOR, SHADE_COLORS } from "@/lib/map-style";
import { MapLegend } from "./map-legend";

const WIDTH = 480;

type Ring = [number, number][];

/**
 * Dashboard panel: a static SVG of the same overview shading (no MapLibre on the home
 * page), linking to /map. Equirectangular, scaled by the cosine of the mid latitude.
 */
export function MapThumbnail({ data, geo }: { data: MapData; geo: RegionFeatureCollection }) {
  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  const rings = (f: RegionFeatureCollection["features"][number]): Ring[] =>
    f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
  for (const f of geo.features) {
    for (const ring of rings(f)) {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y);
      }
    }
  }
  const k = Math.cos((((minY + maxY) / 2) * Math.PI) / 180);
  const scale = WIDTH / ((maxX - minX) * k);
  const height = Math.round((maxY - minY) * scale);

  const steps = new Map(data.units.map((u) => [u.id, u.step]));
  const paths = geo.features.map((f) => {
    let d = "";
    for (const ring of rings(f)) {
      let last = "";
      let part = "";
      for (const [x, y] of ring) {
        const pt = `${((x - minX) * k * scale).toFixed(0)} ${((maxY - y) * scale).toFixed(0)}`;
        if (pt === last) continue;
        part += `${part ? "L" : "M"}${pt}`;
        last = pt;
      }
      d += `${part}Z`;
    }
    return { id: f.properties.id, d, step: steps.get(f.properties.unit) ?? 0 };
  });

  return (
    <div>
      <Link href="/map" className="block rounded-xl border border-border bg-background p-2 transition-colors hover:border-foam">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Thumbnail of the regional map, last ${data.days} days, Activity layer. Opens the interactive map.`}
        >
          {paths.map((p) => (
            <path key={p.id} d={p.d} fill={SHADE_COLORS[p.step]} stroke={OUTLINE_COLOR} strokeWidth={0.5} />
          ))}
        </svg>
      </Link>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
        <MapLegend layer={data.layer} days={data.days} compact />
        <Link href="/map" className="btn-pill">
          Open the map →
        </Link>
      </div>
    </div>
  );
}
