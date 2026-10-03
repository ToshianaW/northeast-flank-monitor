"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ExpressionSpecification, Map as MapLibreMap } from "maplibre-gl";
import type { MapData } from "@/lib/map-data";
import type { RegionFeatureCollection } from "@/lib/placement";
import {
  MAP_BACKGROUND,
  OUTLINE_COLOR,
  SELECTED_OUTLINE_COLOR,
  SHADE_COLORS,
  SHADE_LABELS,
} from "@/lib/map-style";
import { RegionPanel, type MapSelection } from "./region-panel";

type Bounds = [number, number, number, number];

const GEO_URL = "/geo/theater.geojson";
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
// Admin-1 is the finest unit shown, so there is nothing to see past this (spec §60).
const MAX_ZOOM = 8;

function extend(b: Bounds, coords: unknown): Bounds {
  if (typeof (coords as number[])[0] === "number") {
    const [x, y] = coords as [number, number];
    return [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  }
  return (coords as unknown[]).reduce<Bounds>((acc, c) => extend(acc, c), b);
}

const EMPTY: Bounds = [Infinity, Infinity, -Infinity, -Infinity];

function boundsIndex(geo: RegionFeatureCollection) {
  const regions = new Map<string, Bounds>();
  const units = new Map<string, Bounds>();
  let theater = EMPTY;
  for (const f of geo.features) {
    const b = extend(EMPTY, f.geometry.coordinates);
    regions.set(f.properties.id, b);
    units.set(f.properties.unit, extend(units.get(f.properties.unit) ?? EMPTY, [[b[0], b[1]], [b[2], b[3]]]));
    theater = extend(theater, [[b[0], b[1]], [b[2], b[3]]]);
  }
  return { regions, units, theater };
}

const FILL_COLOR: ExpressionSpecification = [
  "match",
  ["coalesce", ["feature-state", "step"], 0],
  1, SHADE_COLORS[1],
  2, SHADE_COLORS[2],
  3, SHADE_COLORS[3],
  SHADE_COLORS[0],
];

function stepLabel(step: number): string {
  return step === 0 ? "none" : SHADE_LABELS[step];
}

/**
 * Region heat map. Overview shades whole areas (countries, Kaliningrad, western Russia,
 * the seas); selecting one zooms to it and shades its admin-1 regions. Polygons only: no
 * markers, no labels, no coordinates from events. The region buttons below the map are the
 * keyboard route to the same selection; the table under the map repeats every count.
 */
export function MapView({ data }: { data: MapData }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const boundsRef = useRef<ReturnType<typeof boundsIndex> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selection, setSelection] = useState<MapSelection>(null);

  const padding = useCallback(() => ((container.current?.clientWidth ?? 0) < 640 ? 16 : 40), []);

  // Create the map once.
  useEffect(() => {
    let cancelled = false;
    let map: MapLibreMap | null = null;
    (async () => {
      try {
        const [ml, geo] = await Promise.all([
          import("maplibre-gl"),
          fetch(GEO_URL).then((r) => {
            if (!r.ok) throw new Error(`geo ${r.status}`);
            return r.json() as Promise<RegionFeatureCollection>;
          }),
        ]);
        if (cancelled || !container.current) return;
        ml.setWorkerUrl(WORKER_URL);
        const index = boundsIndex(geo);
        boundsRef.current = index;
        map = new ml.Map({
          container: container.current,
          style: {
            version: 8,
            sources: {},
            layers: [{ id: "background", type: "background", paint: { "background-color": MAP_BACKGROUND } }],
          },
          bounds: index.theater,
          fitBoundsOptions: { padding: padding() },
          attributionControl: false,
          dragRotate: false,
          pitchWithRotate: false,
          touchPitch: false,
          renderWorldCopies: false,
          maxZoom: MAX_ZOOM,
        });
        mapRef.current = map;
        map.touchZoomRotate.disableRotation();
        map.keyboard.disableRotation();
        map.addControl(new ml.NavigationControl({ showCompass: false }), "top-right");
        map.on("load", () => {
          if (!map) return;
          map.addSource("regions", { type: "geojson", data: geo, promoteId: "id" });
          map.addLayer({
            id: "regions-fill",
            type: "fill",
            source: "regions",
            paint: {
              "fill-color": FILL_COLOR,
              "fill-opacity": ["case", ["boolean", ["feature-state", "dim"], false], 0.4, 1],
            },
          });
          map.addLayer({
            id: "regions-line",
            type: "line",
            source: "regions",
            paint: { "line-color": OUTLINE_COLOR, "line-width": 0.6 },
          });
          map.addLayer({
            id: "regions-selected",
            type: "line",
            source: "regions",
            filter: ["==", ["get", "id"], ""],
            paint: { "line-color": SELECTED_OUTLINE_COLOR, "line-width": 1.8 },
          });
          setReady(true);
        });
        map.on("click", "regions-fill", (e) => {
          const props = e.features?.[0]?.properties as { id: string; unit: string } | undefined;
          if (!props) return;
          triggerRef.current = null;
          setSelection((prev) =>
            prev?.unit === props.unit
              ? { unit: props.unit, region: props.id }
              : { unit: props.unit, region: null },
          );
        });
        map.on("mouseenter", "regions-fill", () => map && (map.getCanvas().style.cursor = "pointer"));
        map.on("mouseleave", "regions-fill", () => map && (map.getCanvas().style.cursor = ""));
        map.on("error", (e) => console.error("Map error", e.error));
      } catch (error) {
        console.error("Map failed to load", error);
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      map?.remove();
      mapRef.current = null;
    };
  }, [padding]);

  // Shading for the current selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const unit of data.units) {
      const zoomedIn = selection?.unit === unit.id;
      for (const region of unit.regions) {
        map.setFeatureState(
          { source: "regions", id: region.id },
          {
            step: zoomedIn ? region.step : unit.step,
            dim: selection !== null && !zoomedIn,
          },
        );
      }
    }
    const outlined = selection
      ? selection.region
        ? [selection.region]
        : (data.units.find((u) => u.id === selection.unit)?.regions.map((r) => r.id) ?? [])
      : [];
    map.setFilter("regions-selected", ["in", ["get", "id"], ["literal", outlined]]);
  }, [data, ready, selection]);

  // Camera follows the selection; zooming out by hand returns to the overview.
  useEffect(() => {
    const map = mapRef.current;
    const index = boundsRef.current;
    if (!map || !ready || !index) return;
    const target = !selection
      ? index.theater
      : selection.region
        ? index.regions.get(selection.region)
        : index.units.get(selection.unit);
    if (target) map.fitBounds(target, { padding: padding(), maxZoom: MAX_ZOOM - 1 });
    if (!selection) return;
    const overviewZoom = map.cameraForBounds(index.theater, { padding: padding() })?.zoom ?? 0;
    const onZoomEnd = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent && map.getZoom() <= overviewZoom + 0.15) setSelection(null);
    };
    map.on("zoomend", onZoomEnd);
    return () => {
      map.off("zoomend", onZoomEnd);
    };
  }, [ready, selection, padding]);

  const close = useCallback(() => {
    setSelection(null);
    triggerRef.current?.focus();
  }, []);

  // Focus the panel when it opens; Escape closes it.
  useEffect(() => {
    if (!selection) return;
    headingRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [selection, close]);

  function choose(next: MapSelection, trigger: HTMLElement) {
    triggerRef.current = trigger;
    setSelection(next);
  }

  const selectedUnit = selection ? data.units.find((u) => u.id === selection.unit) : undefined;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <div className="relative overflow-hidden rounded-xl border border-border" style={{ background: MAP_BACKGROUND }}>
          <div
            ref={container}
            className="h-[60vh] max-h-[620px] min-h-[320px] w-full"
            role="region"
            aria-label="Region heat map. Use the area buttons below the map or the table for the same information."
          />
          {selection ? (
            <button
              type="button"
              onClick={close}
              className="btn-pill absolute top-3 left-3 shadow-lg"
            >
              Back to overview
            </button>
          ) : null}
          {failed ? (
            <p className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-text-secondary">
              The interactive map could not load in this browser. The table below has the same counts.
            </p>
          ) : null}
        </div>

        <nav aria-label="Map areas" className="mt-4">
          <p className="meta-label mb-2">Areas</p>
          <ul className="flex flex-wrap gap-2">
            {data.units.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  aria-pressed={selection?.unit === u.id}
                  onClick={(e) => choose({ unit: u.id, region: null }, e.currentTarget)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    selection?.unit === u.id
                      ? "border-foam text-foreground"
                      : "border-border text-text-secondary hover:text-foreground"
                  }`}
                >
                  {u.name}
                  <span className="sr-only">, shading step {stepLabel(u.step)}</span>
                </button>
              </li>
            ))}
          </ul>
          {selectedUnit && selectedUnit.regions.length > 1 ? (
            <>
              <p className="meta-label mt-4 mb-2">Regions of {selectedUnit.name}</p>
              <ul className="flex flex-wrap gap-2">
                {selectedUnit.regions.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-pressed={selection?.region === r.id}
                      onClick={(e) => choose({ unit: selectedUnit.id, region: r.id }, e.currentTarget)}
                      className={`rounded-full border px-3 py-1 text-xs transition-colors ${
                        selection?.region === r.id
                          ? "border-foam text-foreground"
                          : "border-border text-text-secondary hover:text-foreground"
                      }`}
                    >
                      {r.name}
                      <span className="sr-only">, shading step {stepLabel(r.step)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>
      </div>

      <div className="min-w-0">
        {selection ? (
          <RegionPanel
            data={data}
            selection={selection}
            headingRef={headingRef}
            onSelect={setSelection}
            onClose={close}
          />
        ) : (
          <div className="panel text-sm text-text-secondary">
            Select an area on the map or with the buttons below it to list its published events
            and exercises.
          </div>
        )}
      </div>
    </div>
  );
}
