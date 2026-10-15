import { useEffect, useLayoutEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./electionMap.css";
import type { MapLayer, Readiness } from "../types";
import {
  ALASKA_BOUNDS,
  featureBounds,
  GeometryMissingError,
  HAWAII_BOUNDS,
  loadCounties,
  loadDistricts,
  loadStates,
  LOWER_48_BOUNDS,
  type Bounds,
  type DistrictFeature,
  type StateFeature,
} from "./geo";
import { resolveMapStyle } from "./mapStyle";
import { BIN_COLORS, STATUS_COLORS } from "../pastResults";
import { REDISTRICTED_STATES } from "./redistricting";

export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

export type MapTarget =
  | { kind: "state"; state: string }
  | { kind: "district"; state: string; district: string }
  | { kind: "county"; state: string; fips: string; name: string };

export interface ElectionMapProps {
  layer: MapLayer;
  readiness: Record<string, Readiness>;
  selectedState: string | null;
  /** The district in focus, which the camera frames. */
  selectedDistrict: string | null;
  /** Every selected district (two-digit codes) in the selected state. */
  selectedDistricts: string[];
  /** Selected counties (5-digit FIPS). */
  selectedCounties: string[];
  /** Initial camera from the URL; when absent the map frames the selection or the lower 48. */
  initialView: MapView | null;
  describe: (target: MapTarget) => { title: string; lines: string[] };
  onSelectState: (code: string) => void;
  /** `additive` is true for Shift-, Ctrl-, or Cmd-click, which adds to or removes from the selection. */
  onSelectDistrict: (state: string, district: string, additive: boolean) => void;
  onSelectCounty: (state: string, fips: string, additive: boolean) => void;
  onViewChange: (view: MapView) => void;
  /**
   * Past results colouring for the current `layer`: a colour bin per feature code. While set,
   * readiness colours are replaced; null returns the map to the 2026 view.
   */
  past?: { bins: Map<string, string> | null } | null;
  /** The map fills the window. Switching it keeps the same area in view, scaled to the new frame. */
  expanded?: boolean;
}

// MapLibre paints on a canvas and cannot read CSS variables; these mirror the theme tokens.
const COLORS = { teal: "#5ce1c0", blue: "#6eb6ff", amber: "#f4c769", quiet: "#607089", line: "#3a4a63", soft: "#93a4bd" };
const readinessColor = ["match", ["coalesce", ["feature-state", "readiness"], "pending"], "ready", COLORS.teal, "partial", COLORS.amber, COLORS.quiet];
const hovered = ["boolean", ["feature-state", "hover"], false];
const selectedState = ["boolean", ["feature-state", "selected"], false];
/** Past results: every bin key to its colour; features with no data (no shape match, nothing reported) are grey. */
const pastColor = ["match", ["coalesce", ["feature-state", "past"], "none"], ...Object.entries(BIN_COLORS).flat(), STATUS_COLORS.not_reported];
const pastOpacity = ["case", selectedState, 0.96, hovered, 0.94, 0.82];
const DEFAULT_FILL = {
  states: ["case", selectedState, 0.34, hovered, 0.28, 0.16],
  counties: ["case", selectedState, 0.42, hovered, 0.3, 0.02],
  districts: ["case", selectedState, 0.42, hovered, 0.3, 0.06],
};
const INTERACTIVE = ["districts-fill", "counties-fill", "states-fill"] as const;
/** Districts in states that adopted a new map for 2026; their outlines are the 119th Congress lines. */
const redistrictedFilter = ["in", ["get", "state"], ["literal", [...REDISTRICTED_STATES]]];

type LayerStatus = "idle" | "loading" | "ready" | "missing" | "error";

export default function ElectionMap(props: ElectionMapProps) {
  const { layer, readiness, selectedState, selectedDistrict, selectedDistricts, selectedCounties, initialView, past = null, expanded = false } = props;
  const pastOn = past !== null;
  // Past mode with nothing to colour yet (loading, or House lines that don't match): outlines only.
  const pastPainted = pastOn && Boolean(past?.bins);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const statesRef = useRef<Map<string, StateFeature>>(new Map());
  const districtsRef = useRef<Map<string, DistrictFeature>>(new Map());
  const highlightedCounties = useRef<string[]>([]);
  const pastApplied = useRef<{ source: string; codes: string[] } | null>(null);
  const callbacks = useRef(props);
  callbacks.current = props;
  const initialViewRef = useRef(initialView);
  const skipNextFit = useRef(Boolean(initialView));
  const lastFramed = useRef<string | null>(null);
  /** Container size as of the last paint, so a layout switch can compare old and new frames. */
  const frameSize = useRef<{ width: number; height: number } | null>(null);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "basemap-fallback" | "error" | "no-webgl">("loading");
  const [districtStatus, setDistrictStatus] = useState<LayerStatus>("idle");
  const [countyStatus, setCountyStatus] = useState<LayerStatus>("idle");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);

  // Create the map once.
  useEffect(() => {
    const controller = new AbortController();
    let map: MapLibreMap | null = null;
    let hoverKey: { source: string; id: string } | null = null;
    let resizeObserver: ResizeObserver | null = null;

    (async () => {
      const [{ style, isFallback }, states] = await Promise.all([resolveMapStyle(controller.signal), loadStates()]);
      if (controller.signal.aborted || !containerRef.current) return;
      statesRef.current = new Map(states.features.map((item) => [item.properties.code, item]));

      const start = initialViewRef.current;
      try {
        map = new maplibregl.Map({
          container: containerRef.current,
          style,
          ...(start ? { center: [start.lon, start.lat] as [number, number], zoom: start.zoom } : { bounds: LOWER_48_BOUNDS, fitBoundsOptions: { padding: 24 } }),
          minZoom: 1.5,
          maxZoom: 11,
          attributionControl: { compact: true },
          dragRotate: false,
          // Shift-click adds to the selection; box zoom would swallow Shift+mousedown.
          boxZoom: false,
          pitchWithRotate: false,
          touchPitch: false,
        });
      } catch {
        setStatus("no-webgl");
        return;
      }
      map.touchZoomRotate.disableRotation();
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
      mapRef.current = map;
      resizeObserver = new ResizeObserver(([entry]) => {
        frameSize.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      });
      resizeObserver.observe(containerRef.current);

      map.on("load", () => {
        if (!map) return;
        // Election overlays go under the basemap's labels so place names stay readable.
        const beforeId = map.getStyle().layers.find((item) => item.type === "symbol")?.id;
        const empty = { type: "FeatureCollection" as const, features: [] };
        map.addSource("states", { type: "geojson", data: states, promoteId: "code" });
        map.addSource("districts", { type: "geojson", data: empty, promoteId: "code" });
        map.addSource("counties", { type: "geojson", data: empty, promoteId: "fips" });

        map.addLayer({ id: "states-fill", type: "fill", source: "states", paint: {
          "fill-color": readinessColor as never,
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.34, hovered, 0.28, 0.16] as never,
        } }, beforeId);
        map.addLayer({ id: "counties-fill", type: "fill", source: "counties", layout: { visibility: "none" }, paint: {
          "fill-color": COLORS.blue, "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.42, hovered, 0.3, 0.02] as never,
        } }, beforeId);
        map.addLayer({ id: "counties-line", type: "line", source: "counties", layout: { visibility: "none" }, paint: {
          "line-color": ["case", ["boolean", ["feature-state", "selected"], false], COLORS.blue, COLORS.soft] as never,
          "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.95, 0.45] as never,
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.2, 8, 0.9] as never,
        } }, beforeId);
        map.addLayer({ id: "districts-fill", type: "fill", source: "districts", layout: { visibility: "none" }, paint: {
          "fill-color": COLORS.teal,
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.42, hovered, 0.3, 0.06] as never,
        } }, beforeId);
        map.addLayer({ id: "districts-line", type: "line", source: "districts", layout: { visibility: "none" }, paint: {
          "line-color": COLORS.teal, "line-opacity": 0.7, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 1.4] as never,
        } }, beforeId);
        map.addLayer({ id: "districts-outdated-line", type: "line", source: "districts", layout: { visibility: "none" }, filter: redistrictedFilter as never, paint: {
          "line-color": COLORS.amber, "line-opacity": 0.85, "line-dasharray": [2, 2],
          "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.6, 8, 1.6] as never,
        } }, beforeId);
        map.addLayer({ id: "states-line", type: "line", source: "states", paint: {
          "line-color": COLORS.line, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 7, 1.4] as never,
        } }, beforeId);
        map.addLayer({ id: "states-selected", type: "line", source: "states", filter: ["==", ["get", "code"], ""], paint: {
          "line-color": COLORS.teal, "line-width": 2.4,
        } }, beforeId);

        setStatus(isFallback ? "basemap-fallback" : "ready");
        setReady(true);
      });

      map.on("error", (event) => {
        // Tile and glyph failures are non-fatal; the overlays keep working.
        if (import.meta.env.DEV) console.warn("Map error", event.error);
      });

      const topFeature = (event: MapMouseEvent) => {
        if (!map) return undefined;
        const layers = INTERACTIVE.filter((id) => map!.getLayer(id) && map!.getLayoutProperty(id, "visibility") !== "none");
        return map.queryRenderedFeatures(event.point, { layers })[0];
      };
      const toTarget = (item: maplibregl.MapGeoJSONFeature): MapTarget => {
        const p = item.properties as Record<string, string>;
        if (item.layer.id === "districts-fill") return { kind: "district", state: p.state, district: p.district };
        if (item.layer.id === "counties-fill") return { kind: "county", state: p.state, fips: p.fips, name: p.name };
        return { kind: "state", state: p.code };
      };

      map.on("mousemove", (event) => {
        if (!map) return;
        const item = topFeature(event);
        const key = item ? { source: item.source, id: String(item.id) } : null;
        if (hoverKey && (!key || hoverKey.source !== key.source || hoverKey.id !== key.id)) {
          map.setFeatureState(hoverKey, { hover: false });
        }
        hoverKey = key;
        if (!item || !key) {
          map.getCanvas().style.cursor = "";
          setTooltip(null);
          return;
        }
        map.setFeatureState(key, { hover: true });
        map.getCanvas().style.cursor = "pointer";
        setTooltip({ x: event.point.x, y: event.point.y, ...callbacks.current.describe(toTarget(item)) });
      });
      map.on("mouseout", () => {
        if (map && hoverKey) map.setFeatureState(hoverKey, { hover: false });
        hoverKey = null;
        setTooltip(null);
      });
      map.on("click", (event) => {
        const item = topFeature(event);
        if (!item) return;
        const target = toTarget(item);
        const { shiftKey, ctrlKey, metaKey } = event.originalEvent;
        const additive = shiftKey || ctrlKey || metaKey;
        if (target.kind === "district") callbacks.current.onSelectDistrict(target.state, target.district, additive);
        else if (target.kind === "county") callbacks.current.onSelectCounty(target.state, target.fips, additive);
        else callbacks.current.onSelectState(target.state);
      });
      map.on("moveend", () => {
        if (!map) return;
        const center = map.getCenter();
        callbacks.current.onViewChange({
          lat: Number(center.lat.toFixed(4)),
          lon: Number(center.lng.toFixed(4)),
          zoom: Number(map.getZoom().toFixed(2)),
        });
      });
    })().catch((error) => {
      if (!controller.signal.aborted) {
        console.error("Election map failed to load", error);
        setStatus("error");
      }
    });

    return () => {
      controller.abort();
      resizeObserver?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, []);

  // Expanding or collapsing changes the frame's size before the next paint; scale the zoom with it
  // so the area in view stays the same instead of shrinking into a corner of a larger frame.
  const wasExpanded = useRef(expanded);
  useLayoutEffect(() => {
    if (wasExpanded.current === expanded) return;
    wasExpanded.current = expanded;
    const map = mapRef.current;
    const before = frameSize.current;
    const container = containerRef.current;
    if (!map || !container || !before?.width || !before.height) return;
    const after = container.getBoundingClientRect();
    const scale = Math.min(after.width / before.width, after.height / before.height);
    if (!(scale > 0) || !Number.isFinite(scale)) return;
    map.resize();
    map.jumpTo({ zoom: map.getZoom() + Math.log2(scale) });
  }, [expanded]);

  // Lazily load district and county geometry the first time their layer is opened.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (layer === "districts" && districtStatus === "idle") {
      setDistrictStatus("loading");
      loadDistricts()
        .then((data) => {
          districtsRef.current = new Map(data.features.map((item) => [item.properties.code, item as DistrictFeature]));
          (map.getSource("districts") as GeoJSONSource | undefined)?.setData(data);
          setDistrictStatus("ready");
        })
        .catch((error) => setDistrictStatus(error instanceof GeometryMissingError ? "missing" : "error"));
    }
    if (layer === "counties" && countyStatus === "idle") {
      setCountyStatus("loading");
      loadCounties()
        .then((data) => {
          (map.getSource("counties") as GeoJSONSource | undefined)?.setData(data);
          setCountyStatus("ready");
        })
        .catch(() => setCountyStatus("error"));
    }
  }, [layer, ready, districtStatus, countyStatus]);

  // Layer visibility, per-state filters, and the switch between readiness and past-results colours.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const show = (ids: string[], visible: boolean) => ids.forEach((id) => map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"));
    show(["districts-fill", "districts-line"], layer === "districts");
    // The dashed "2026 lines differ" outline is about the 2026 races, not past results.
    show(["districts-outdated-line"], layer === "districts" && !pastOn);
    show(["counties-fill", "counties-line"], layer === "counties");
    map.setPaintProperty("states-fill", "fill-color", (pastOn && layer === "states" ? pastColor : readinessColor) as never);
    map.setPaintProperty("states-fill", "fill-opacity", (layer === "states"
      ? pastOn ? (pastPainted ? pastOpacity : 0) : DEFAULT_FILL.states
      : pastOn ? 0 : ["case", hovered, 0.12, 0.05]) as never);
    map.setPaintProperty("counties-fill", "fill-color", (pastOn ? pastColor : COLORS.blue) as never);
    map.setPaintProperty("counties-fill", "fill-opacity", (pastOn ? (pastPainted ? pastOpacity : 0) : DEFAULT_FILL.counties) as never);
    map.setPaintProperty("districts-fill", "fill-color", (pastOn ? pastColor : COLORS.teal) as never);
    map.setPaintProperty("districts-fill", "fill-opacity", (pastOn ? (pastPainted ? pastOpacity : 0) : DEFAULT_FILL.districts) as never);
    // Party colours fill the shapes in past mode, so outlines and the selection ring turn neutral.
    map.setPaintProperty("districts-line", "line-color", pastOn ? COLORS.line : COLORS.teal);
    map.setPaintProperty("states-selected", "line-color", pastOn ? "#ffffff" : COLORS.teal);
    map.setPaintProperty("states-line", "line-color", pastOn && layer === "states" ? "#0b0f16" : COLORS.line);
    const stateFilter = selectedState ? ["==", ["get", "state"], selectedState] : null;
    for (const id of ["districts-fill", "counties-fill", "counties-line"]) map.setFilter(id, stateFilter as never);
    // Redistricted states get a dashed outline; line-dasharray cannot vary per feature.
    const both = (filter: unknown[]) => (stateFilter ? ["all", stateFilter, filter] : filter) as never;
    map.setFilter("districts-line", pastOn ? stateFilter as never : both(["!", redistrictedFilter]));
    map.setFilter("districts-outdated-line", both(redistrictedFilter));
  }, [layer, ready, selectedState, pastOn, pastPainted]);

  // Past results colour bins, as feature state on the layer's source (over 3,000 counties).
  const pastBins = past?.bins ?? null;
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const sourceReady = layer === "states" || (layer === "counties" ? countyStatus === "ready" : districtStatus === "ready");
    const applied = pastApplied.current;
    if (applied) for (const code of applied.codes) map.setFeatureState({ source: applied.source, id: code }, { past: null });
    pastApplied.current = null;
    if (!pastBins || !sourceReady) return;
    for (const [code, bin] of pastBins) map.setFeatureState({ source: layer, id: code }, { past: bin });
    pastApplied.current = { source: layer, codes: [...pastBins.keys()] };
  }, [pastBins, layer, ready, countyStatus, districtStatus]);

  // Readiness colouring.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const code of statesRef.current.keys()) {
      map.setFeatureState({ source: "states", id: code }, { readiness: readiness[code] ?? "pending" });
    }
  }, [readiness, ready]);

  // Selection highlight and camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const state = selectedState ? statesRef.current.get(selectedState) : undefined;
    for (const code of statesRef.current.keys()) map.setFeatureState({ source: "states", id: code }, { selected: code === selectedState });
    map.setFilter("states-selected", ["==", ["get", "code"], state ? selectedState : ""]);

    const districtCode = selectedState && selectedDistrict ? `${selectedState}-${selectedDistrict}` : null;
    const chosen = new Set(selectedState ? selectedDistricts.map((item) => `${selectedState}-${item}`) : []);
    for (const code of districtsRef.current.keys()) map.setFeatureState({ source: "districts", id: code }, { selected: chosen.has(code) });

    const district = districtCode && layer === "districts" ? districtsRef.current.get(districtCode) : undefined;
    const frameKey = district ? `d:${districtCode}` : state ? `s:${selectedState}` : "us";
    if (skipNextFit.current) {
      skipNextFit.current = false;
      lastFramed.current = frameKey;
      return;
    }
    if (lastFramed.current === frameKey) return;
    lastFramed.current = frameKey;
    const bounds = district ? featureBounds(district) : state ? featureBounds(state) : LOWER_48_BOUNDS;
    map.fitBounds(bounds, { padding: 36, maxZoom: district ? 9 : 7, duration: 900 });
  }, [selectedState, selectedDistrict, selectedDistricts, layer, ready, districtStatus]);

  // County selection highlight. Only the changed counties are touched; there are over 3,000.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || countyStatus !== "ready") return;
    for (const fips of highlightedCounties.current) map.setFeatureState({ source: "counties", id: fips }, { selected: false });
    for (const fips of selectedCounties) map.setFeatureState({ source: "counties", id: fips }, { selected: true });
    highlightedCounties.current = selectedCounties;
  }, [selectedCounties, ready, countyStatus]);

  const jump = (bounds: Bounds) => mapRef.current?.fitBounds(bounds, { padding: 24, duration: 900 });

  if (status === "no-webgl" || status === "error") {
    return (
      <div className="em-map-fallback" role="status">
        <strong>{status === "no-webgl" ? "Interactive map unavailable" : "Map failed to load"}</strong>
        <span>{status === "no-webgl" ? "Your browser could not start WebGL." : "Map data could not be loaded."} Use the Location selector to choose a state.</span>
      </div>
    );
  }

  const layerNotice = layer === "districts"
    ? districtStatus === "missing" ? `District boundaries unavailable${import.meta.env.DEV ? " (run npm run build:geo)" : ""}` : districtStatus === "error" ? "District boundaries failed to load" : districtStatus === "loading" ? "Loading district boundaries…" : null
    : layer === "counties"
      ? countyStatus === "error" ? "County boundaries failed to load" : countyStatus === "loading" ? "Loading county boundaries…" : null
      : null;

  return (
    <div className="em-map-frame">
      <div ref={containerRef} className="em-map" role="region" aria-label="Interactive map of the United States. Use the Location selector for keyboard access." />
      {status === "loading" && <div className="em-map-loading" aria-hidden="true" />}
      <div className="em-map-jumps" role="group" aria-label="Map view">
        <button type="button" onClick={() => jump(LOWER_48_BOUNDS)}>Lower 48</button>
        <button type="button" onClick={() => jump(ALASKA_BOUNDS)}>Alaska</button>
        <button type="button" onClick={() => jump(HAWAII_BOUNDS)}>Hawaii</button>
      </div>
      <div className="em-map-chips">
        {status === "basemap-fallback" && <span className="em-map-chip">Basemap unavailable · boundaries only</span>}
        {layerNotice && <span className="em-map-chip" role="status">{layerNotice}</span>}
      </div>
      {tooltip && (
        <div className="em-map-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
          <strong>{tooltip.title}</strong>
          {tooltip.lines.map((line) => <span key={line}>{line}</span>)}
        </div>
      )}
    </div>
  );
}

