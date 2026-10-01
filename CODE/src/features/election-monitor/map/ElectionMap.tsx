import { useEffect, useRef, useState } from "react";
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap, type MapMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
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
  selectedDistrict: string | null;
  /** Initial camera from the URL; when absent the map frames the selection or the lower 48. */
  initialView: MapView | null;
  describe: (target: MapTarget) => { title: string; lines: string[] };
  onSelectState: (code: string) => void;
  onSelectDistrict: (state: string, district: string) => void;
  onViewChange: (view: MapView) => void;
}

// MapLibre paints on a canvas and cannot read CSS variables; these mirror the theme tokens.
const COLORS = { teal: "#5ce1c0", blue: "#6eb6ff", amber: "#f4c769", quiet: "#607089", line: "#3a4a63", soft: "#93a4bd" };
const readinessColor = ["match", ["coalesce", ["feature-state", "readiness"], "pending"], "ready", COLORS.teal, "partial", COLORS.amber, COLORS.quiet];
const hovered = ["boolean", ["feature-state", "hover"], false];
const INTERACTIVE = ["districts-fill", "counties-fill", "states-fill"] as const;

type LayerStatus = "idle" | "loading" | "ready" | "missing" | "error";

export default function ElectionMap(props: ElectionMapProps) {
  const { layer, readiness, selectedState, selectedDistrict, initialView } = props;
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const statesRef = useRef<Map<string, StateFeature>>(new Map());
  const districtsRef = useRef<Map<string, DistrictFeature>>(new Map());
  const callbacks = useRef(props);
  callbacks.current = props;
  const initialViewRef = useRef(initialView);
  const skipNextFit = useRef(Boolean(initialView));
  const lastFramed = useRef<string | null>(null);

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
          "fill-color": COLORS.blue, "fill-opacity": ["case", hovered, 0.3, 0.02] as never,
        } }, beforeId);
        map.addLayer({ id: "counties-line", type: "line", source: "counties", layout: { visibility: "none" }, paint: {
          "line-color": COLORS.soft, "line-opacity": 0.45, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.2, 8, 0.9] as never,
        } }, beforeId);
        map.addLayer({ id: "districts-fill", type: "fill", source: "districts", layout: { visibility: "none" }, paint: {
          "fill-color": COLORS.teal,
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.42, hovered, 0.3, 0.06] as never,
        } }, beforeId);
        map.addLayer({ id: "districts-line", type: "line", source: "districts", layout: { visibility: "none" }, paint: {
          "line-color": COLORS.teal, "line-opacity": 0.7, "line-width": ["interpolate", ["linear"], ["zoom"], 3, 0.4, 8, 1.4] as never,
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
        if (target.kind === "district") callbacks.current.onSelectDistrict(target.state, target.district);
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
      map?.remove();
      mapRef.current = null;
    };
  }, []);

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

  // Layer visibility and per-state filters.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const show = (ids: string[], visible: boolean) => ids.forEach((id) => map.setLayoutProperty(id, "visibility", visible ? "visible" : "none"));
    show(["districts-fill", "districts-line"], layer === "districts");
    show(["counties-fill", "counties-line"], layer === "counties");
    map.setPaintProperty("states-fill", "fill-opacity", layer === "states"
      ? ["case", ["boolean", ["feature-state", "selected"], false], 0.34, hovered, 0.28, 0.16]
      : ["case", hovered, 0.12, 0.05]);
    const stateFilter = selectedState ? ["==", ["get", "state"], selectedState] : null;
    for (const id of ["districts-fill", "districts-line", "counties-fill", "counties-line"]) map.setFilter(id, stateFilter as never);
  }, [layer, ready, selectedState]);

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
    for (const code of districtsRef.current.keys()) map.setFeatureState({ source: "districts", id: code }, { selected: code === districtCode });

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
  }, [selectedState, selectedDistrict, layer, ready, districtStatus]);

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

