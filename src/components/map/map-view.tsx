"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GeoJSONSource, Map as MapLibreMap, MapGeoJSONFeature } from "maplibre-gl";
import type { MapData } from "@/lib/map-data";
import { dotFeatures } from "@/lib/map-dots";
import { dotRadii, DOTS_SOURCE, mapLayers, OUTLINES_SOURCE } from "@/lib/map-layers";
import { MAP_BACKGROUND, REGION_DOT_SCALE, SEA_AREAS, STEP_LABELS, THEATER_WIDE_ID } from "@/lib/map-style";
import type { RegionFeatureCollection } from "@/lib/placement";
import { OutsideCards } from "./outside-cards";
import { RegionPanel, type MapSelection } from "./region-panel";

type Bounds = [number, number, number, number];

const GEO_URL = "/geo/theater.geojson";
const WORKER_URL = "/maplibre/maplibre-gl-worker.mjs";
// Admin-1 is the finest unit shown, so there is nothing to see past this (spec §60).
const MAX_ZOOM = 8;

const EMPTY: Bounds = [Infinity, Infinity, -Infinity, -Infinity];

function extend(b: Bounds, coords: unknown): Bounds {
  if (typeof (coords as number[])[0] === "number") {
    const [x, y] = coords as [number, number];
    return [Math.min(b[0], x), Math.min(b[1], y), Math.max(b[2], x), Math.max(b[3], y)];
  }
  return (coords as unknown[]).reduce<Bounds>((acc, c) => extend(acc, c), b);
}

function boundsIndex(geo: RegionFeatureCollection) {
  const regions = new Map<string, Bounds>();
  const units = new Map<string, Bounds>();
  let land = EMPTY;
  for (const f of geo.features) {
    const b = extend(EMPTY, f.geometry.coordinates);
    if (f.properties.level === "unit") {
      units.set(f.properties.id, b);
      if (!(SEA_AREAS as readonly string[]).includes(f.properties.id)) land = extend(land, [[b[0], b[1]], [b[2], b[3]]]);
    } else {
      regions.set(f.properties.id, b);
    }
  }
  return { regions, units, land };
}

/** Width / height of a lon-lat box in Web Mercator, so the frame matches the theater. */
function mercatorAspect([x1, y1, x2, y2]: Bounds): number {
  const y = (lat: number) => Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
  return ((x2 - x1) * Math.PI) / 180 / (y(y2) - y(y1));
}

/**
 * Region map with dots (decision 14). Overview: calm land, country outlines, faint seas, and
 * one dot per area with activity at its fixed anchor. Selecting an area fits to it, shows
 * its admin-1 outlines faintly and one dot per region with activity. Dots are aggregates at
 * hand-set anchors; no event coordinates reach this component. The area buttons and the
 * table under the map give the same information without the canvas.
 */
export function MapView({ data }: { data: MapData }) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const boundsRef = useRef<ReturnType<typeof boundsIndex> | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const selectionRef = useRef<MapSelection>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [aspect, setAspect] = useState(1.1);
  const [selection, setSelection] = useState<MapSelection>(null);

  const onMapUnit = useCallback(
    (id: string | undefined) => data.units.find((u) => u.id === id && u.onMap),
    [data.units],
  );
  // The selected map area, if any (cards and Theater-wide leave the map in overview).
  const zoomedUnit = selection && onMapUnit(selection.unit) ? selection.unit : null;
  const dots = useMemo(() => dotFeatures(data.units, zoomedUnit), [data.units, zoomedUnit]);

  const padding = useCallback(() => ((container.current?.clientWidth ?? 0) < 640 ? 12 : 24), []);

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
        setAspect(mercatorAspect(index.land));
        const [x1, y1, x2, y2] = index.land;
        map = new ml.Map({
          container: container.current,
          style: { version: 8, sources: {}, layers: [] },
          bounds: index.land,
          fitBoundsOptions: { padding: padding() },
          maxBounds: [x1 - 6, y1 - 3, x2 + 6, y2 + 3],
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
          map.addSource(OUTLINES_SOURCE, { type: "geojson", data: geo });
          map.addSource(DOTS_SOURCE, { type: "geojson", data: { type: "FeatureCollection", features: [] }, promoteId: "id" });
          for (const layer of mapLayers()) map.addLayer(layer);
          map.resize();
          map.fitBounds(index.land, { padding: padding(), duration: 0 });
          setReady(true);
        });

        // Dots first: a click on a dot never falls through to the polygon under it.
        let hoveredDot: string | null = null;
        const setHover = (id: string | null) => {
          if (!map) return;
          if (hoveredDot) map.setFeatureState({ source: DOTS_SOURCE, id: hoveredDot }, { hover: false });
          hoveredDot = id;
          if (id) map.setFeatureState({ source: DOTS_SOURCE, id }, { hover: true });
        };
        map.on("mousemove", (e) => {
          if (!map) return;
          const dot = map.queryRenderedFeatures(e.point, { layers: ["dots-hit"] })[0];
          setHover(dot ? String(dot.properties.id) : null);
          const area = map.queryRenderedFeatures(e.point, { layers: ["areas-fill", "regions-hit"] })[0];
          map.getCanvas().style.cursor = dot || area ? "pointer" : "";
        });
        map.on("mouseout", () => setHover(null));
        map.on("click", (e) => {
          if (!map) return;
          const current = selectionRef.current;
          const dot = map.queryRenderedFeatures(e.point, { layers: ["dots-hit"] })[0];
          const region = map.queryRenderedFeatures(e.point, { layers: ["regions-hit"] })[0];
          const area = map.queryRenderedFeatures(e.point, { layers: ["areas-fill"] })[0];
          const pick = (f: MapGeoJSONFeature | undefined) => (f ? String(f.properties.id) : null);
          triggerRef.current = null;
          const zoomed = current && boundsRef.current?.units.has(current.unit) ? current.unit : null;
          if (zoomed) {
            // Zoomed in: a dot or polygon of this area picks its region; elsewhere picks that area.
            const regionId = pick(dot) ?? pick(region);
            if (regionId && region && String(region.properties.unit) === zoomed) {
              setSelection({ unit: zoomed, region: regionId });
              return;
            }
          }
          const areaId = (!zoomed && pick(dot)) || pick(area);
          if (areaId) setSelection({ unit: areaId, region: null });
        });
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

  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);

  // Keep the frame matched to the theater when its shape is known.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !boundsRef.current) return;
    map.resize();
    if (!zoomedUnit) map.fitBounds(boundsRef.current.land, { padding: padding(), duration: 0 });
    // Only when the frame changes shape, not on every selection.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aspect, ready]);

  // Dots, region outlines and the selected outline follow the selection.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    (map.getSource(DOTS_SOURCE) as GeoJSONSource | undefined)?.setData(dots);
    // Region dots inside a zoomed area are smaller than the overview's area dots.
    for (const [layer, value] of Object.entries(dotRadii(zoomedUnit ? REGION_DOT_SCALE : 1))) {
      map.setPaintProperty(layer, "circle-radius", value);
    }
    const inUnit: ["==", ["get", "unit"], string] = ["==", ["get", "unit"], zoomedUnit ?? ""];
    map.setFilter("regions-line", ["all", ["==", ["get", "level"], "region"], inUnit]);
    map.setFilter("regions-hit", ["all", ["==", ["get", "level"], "region"], inUnit]);
    const outlined = selection?.region && zoomedUnit ? selection.region : zoomedUnit ?? "";
    map.setFilter("selected-line", [
      "all",
      ["==", ["get", "id"], outlined],
      ["==", ["get", "level"], selection?.region && zoomedUnit ? "region" : "unit"],
    ]);
  }, [ready, dots, zoomedUnit, selection]);

  // Camera: fit to the selected area or region; zooming out by hand returns to the overview.
  useEffect(() => {
    const map = mapRef.current;
    const index = boundsRef.current;
    if (!map || !ready || !index) return;
    const target = !zoomedUnit
      ? index.land
      : selection?.region
        ? index.regions.get(selection.region)
        : index.units.get(zoomedUnit);
    if (target) map.fitBounds(target, { padding: padding() * 2, maxZoom: MAX_ZOOM - 1 });
    if (!zoomedUnit) return;
    const overviewZoom = map.cameraForBounds(index.land, { padding: padding() })?.zoom ?? 0;
    const onZoomEnd = (e: { originalEvent?: unknown }) => {
      if (e.originalEvent && map.getZoom() <= overviewZoom + 0.15) setSelection(null);
    };
    map.on("zoomend", onZoomEnd);
    return () => {
      map.off("zoomend", onZoomEnd);
    };
  }, [ready, zoomedUnit, selection, padding]);

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

  const mapAreas = data.units.filter((u) => u.onMap);
  const zoomed = zoomedUnit ? data.units.find((u) => u.id === zoomedUnit) : undefined;
  const pill = (active: boolean, small = false) =>
    `rounded-full border px-3 py-1 ${small ? "text-xs" : "text-sm"} transition-colors ${
      active ? "border-foam text-foreground" : "border-border text-text-secondary hover:text-foreground"
    }`;
  const stepText = (step: number) => (step === 0 ? "no dot" : `dot size ${STEP_LABELS[step]}`);

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
      <div className="min-w-0">
        <div className="relative overflow-hidden rounded-xl border border-border" style={{ background: MAP_BACKGROUND }}>
          <div
            ref={container}
            className="w-full"
            style={{ aspectRatio: String(aspect), maxHeight: "78vh", minHeight: 300 }}
            role="region"
            aria-label="Map of the theater with one dot per area with activity. Use the area buttons below the map or the table for the same information."
          />
          {zoomedUnit ? (
            <button type="button" onClick={close} className="btn-pill absolute top-3 left-3 shadow-lg">
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
          <p className="meta-label mb-2">Areas on the map</p>
          <ul className="flex flex-wrap gap-2">
            {mapAreas.map((u) => (
              <li key={u.id}>
                <button
                  type="button"
                  aria-pressed={selection?.unit === u.id}
                  onClick={(e) => choose({ unit: u.id, region: null }, e.currentTarget)}
                  className={pill(selection?.unit === u.id)}
                >
                  {u.name}
                  <span className="sr-only">, {u.count} published, {stepText(u.step)}</span>
                </button>
              </li>
            ))}
            <li>
              <button
                type="button"
                aria-pressed={selection?.unit === THEATER_WIDE_ID}
                onClick={(e) => choose({ unit: THEATER_WIDE_ID, region: null }, e.currentTarget)}
                className={pill(selection?.unit === THEATER_WIDE_ID)}
              >
                Theater-wide
                <span className="sr-only">, {data.theaterWide.count} published</span>
              </button>
            </li>
          </ul>
          {zoomed && zoomed.regions.length > 1 ? (
            <>
              <p className="meta-label mt-4 mb-2">Regions of {zoomed.name}</p>
              <ul className="flex flex-wrap gap-2">
                {zoomed.regions.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      aria-pressed={selection?.region === r.id}
                      onClick={(e) => choose({ unit: zoomed.id, region: r.id }, e.currentTarget)}
                      className={pill(selection?.region === r.id, true)}
                    >
                      {r.name}
                      <span className="sr-only">, {r.count} published, {stepText(r.step)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </nav>

        <OutsideCards
          units={data.units.filter((u) => !u.onMap)}
          selected={selection?.unit ?? null}
          onChoose={(id, trigger) => choose({ unit: id, region: null }, trigger)}
        />
      </div>

      <div className="min-w-0">
        {selection ? (
          <RegionPanel data={data} selection={selection} headingRef={headingRef} onSelect={setSelection} />
        ) : (
          <div className="panel text-sm text-text-secondary">
            Select a dot, an area on the map, or a button or card below the map to list its published
            events and exercises.
          </div>
        )}
      </div>
    </div>
  );
}
