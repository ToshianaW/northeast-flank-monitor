import Link from "next/link";
import type { MapData } from "@/lib/map-data";
import { dotFeatures } from "@/lib/map-dots";
import type { RegionFeatureCollection } from "@/lib/placement";
import {
  COUNTRY_OUTLINE_COLOR,
  DOT_RADIUS,
  heatColor,
  LAYER_LABELS,
  LAND_COLOR,
  SEA_AREAS,
  SEA_COLOR,
} from "@/lib/map-style";
import { MapLegend } from "./map-legend";

const WIDTH = 480;

type Ring = [number, number][];

/**
 * Dashboard panel: a static SVG of the overview (area outlines and the same dots at their
 * fixed anchors), linking to /map. No MapLibre on the home page. Web Mercator, framed on
 * the land areas like the full map.
 */
export function MapThumbnail({ data, geo }: { data: MapData; geo: RegionFeatureCollection }) {
  const areas = geo.features.filter((f) => f.properties.level === "unit");
  const isSea = (id: string) => (SEA_AREAS as readonly string[]).includes(id);
  const rings = (f: (typeof areas)[number]): Ring[] =>
    f.geometry.type === "Polygon" ? f.geometry.coordinates : f.geometry.coordinates.flat();
  const my = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));

  let [minX, minY, maxX, maxY] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const f of areas.filter((a) => !isSea(a.properties.id))) {
    for (const ring of rings(f)) {
      for (const [x, y] of ring) {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minY = Math.min(minY, my(y)); maxY = Math.max(maxY, my(y));
      }
    }
  }
  const scale = WIDTH / (((maxX - minX) * Math.PI) / 180);
  const height = Math.round((maxY - minY) * scale);
  const project = (x: number, y: number) => [((x - minX) * Math.PI) / 180 * scale, (maxY - my(y)) * scale];

  const paths = areas.map((f) => {
    let d = "";
    for (const ring of rings(f)) {
      let last = "";
      let part = "";
      for (const [x, y] of ring) {
        const [px, py] = project(x, y);
        const pt = `${px.toFixed(0)} ${py.toFixed(0)}`;
        if (pt === last) continue;
        part += `${part ? "L" : "M"}${pt}`;
        last = pt;
      }
      d += `${part}Z`;
    }
    return { id: f.properties.id, d, sea: isSea(f.properties.id) };
  });
  const dots = dotFeatures(data.units, null).features.map((f) => {
    const [cx, cy] = project(...f.geometry.coordinates);
    return { id: f.properties.id, cx, cy, r: DOT_RADIUS[f.properties.step], color: heatColor(f.properties.step) };
  });

  return (
    <div>
      <Link href="/map" className="block overflow-hidden rounded-xl border border-border bg-background transition-colors hover:border-foam">
        <svg
          viewBox={`0 0 ${WIDTH} ${height}`}
          className="h-auto w-full"
          role="img"
          aria-label={`Thumbnail of the regional map, last ${data.days} days, ${LAYER_LABELS[data.layer]} layer, one dot per area with activity. Opens the interactive map.`}
        >
          <defs>
            <filter id="thumb-glow" x="-100%" y="-100%" width="300%" height="300%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
          </defs>
          {paths.map((p) => (
            <path
              key={p.id}
              d={p.d}
              fill={p.sea ? SEA_COLOR : LAND_COLOR}
              stroke={p.sea ? "none" : COUNTRY_OUTLINE_COLOR}
              strokeWidth={0.6}
            />
          ))}
          {dots.map((d) => (
            <g key={d.id}>
              <circle cx={d.cx} cy={d.cy} r={d.r * 2} fill={d.color} opacity={0.45} filter="url(#thumb-glow)" />
              <circle cx={d.cx} cy={d.cy} r={d.r} fill={d.color} />
            </g>
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
