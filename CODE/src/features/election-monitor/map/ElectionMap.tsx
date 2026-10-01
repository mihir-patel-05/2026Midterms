import { useEffect, useRef, useState } from "react";
import maplibregl, { type Map as MapLibreMap, type MapLayerMouseEvent } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Readiness } from "../types";
import { ALASKA_BOUNDS, featureBounds, HAWAII_BOUNDS, loadStates, LOWER_48_BOUNDS, type Bounds, type StateFeature } from "./geo";
import { resolveMapStyle } from "./mapStyle";

export interface MapView {
  lat: number;
  lon: number;
  zoom: number;
}

export interface ElectionMapProps {
  readiness: Record<string, Readiness>;
  selectedState: string | null;
  /** Initial camera from the URL; when absent the map frames the selection or the lower 48. */
  initialView: MapView | null;
  describeState: (code: string) => { title: string; lines: string[] };
  onSelectState: (code: string) => void;
  onViewChange: (view: MapView) => void;
}

// MapLibre paints on a canvas and cannot read CSS variables; these mirror the theme tokens.
const COLORS = { teal: "#5ce1c0", amber: "#f4c769", quiet: "#607089", line: "#3a4a63" };

const readinessColor = ["match", ["coalesce", ["feature-state", "readiness"], "pending"], "ready", COLORS.teal, "partial", COLORS.amber, COLORS.quiet] as const;

export default function ElectionMap({ readiness, selectedState, initialView, describeState, onSelectState, onViewChange }: ElectionMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const featuresRef = useRef<Map<string, StateFeature>>(new Map());
  const callbacks = useRef({ describeState, onSelectState, onViewChange });
  callbacks.current = { describeState, onSelectState, onViewChange };
  const initialViewRef = useRef(initialView);
  const skipNextFit = useRef(Boolean(initialView));
  const appliedSelection = useRef<string | null>(null);

  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<"loading" | "ready" | "basemap-fallback" | "error" | "no-webgl">("loading");
  const [tooltip, setTooltip] = useState<{ x: number; y: number; title: string; lines: string[] } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let map: MapLibreMap | null = null;
    let hovered: string | null = null;

    (async () => {
      const [{ style, isFallback }, states] = await Promise.all([resolveMapStyle(controller.signal), loadStates()]);
      if (controller.signal.aborted || !containerRef.current) return;
      featuresRef.current = new Map(states.features.map((item) => [item.properties.code, item]));

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
        // Put election overlays under the basemap's labels so place names stay readable.
        const firstLabel = map.getStyle().layers.find((layer) => layer.type === "symbol")?.id;
        map.addSource("states", { type: "geojson", data: states, promoteId: "code" });
        map.addLayer({
          id: "states-fill",
          type: "fill",
          source: "states",
          paint: {
            "fill-color": readinessColor as unknown as string,
            "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.34, ["boolean", ["feature-state", "hover"], false], 0.26, 0.12],
          },
        }, firstLabel);
        map.addLayer({
          id: "states-line",
          type: "line",
          source: "states",
          paint: { "line-color": COLORS.line, "line-width": ["interpolate", ["linear"], ["zoom"], 2, 0.6, 7, 1.4] },
        }, firstLabel);
        map.addLayer({
          id: "states-selected",
          type: "line",
          source: "states",
          filter: ["==", ["get", "code"], ""],
          paint: { "line-color": COLORS.teal, "line-width": 2.4 },
        }, firstLabel);
        setStatus(isFallback ? "basemap-fallback" : "ready");
        setReady(true);
      });

      map.on("error", (event) => {
        // Tile/glyph failures are non-fatal; the overlays keep working.
        if (import.meta.env.DEV) console.warn("Map error", event.error);
      });

      map.on("mousemove", "states-fill", (event: MapLayerMouseEvent) => {
        const code = event.features?.[0]?.properties?.code as string | undefined;
        if (!map || !code) return;
        if (hovered && hovered !== code) map.setFeatureState({ source: "states", id: hovered }, { hover: false });
        hovered = code;
        map.setFeatureState({ source: "states", id: code }, { hover: true });
        map.getCanvas().style.cursor = "pointer";
        setTooltip({ x: event.point.x, y: event.point.y, ...callbacks.current.describeState(code) });
      });
      map.on("mouseleave", "states-fill", () => {
        if (map && hovered) map.setFeatureState({ source: "states", id: hovered }, { hover: false });
        hovered = null;
        if (map) map.getCanvas().style.cursor = "";
        setTooltip(null);
      });
      map.on("click", "states-fill", (event: MapLayerMouseEvent) => {
        const code = event.features?.[0]?.properties?.code as string | undefined;
        if (code) callbacks.current.onSelectState(code);
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

  // Readiness colouring.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    for (const code of featuresRef.current.keys()) {
      map.setFeatureState({ source: "states", id: code }, { readiness: readiness[code] ?? "pending" });
    }
  }, [readiness, ready]);

  // Selection highlight and camera.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const previous = appliedSelection.current;
    if (previous) map.setFeatureState({ source: "states", id: previous }, { selected: false });
    const selected = selectedState && featuresRef.current.get(selectedState);
    map.setFilter("states-selected", ["==", ["get", "code"], selected ? selectedState : ""]);
    if (selected) map.setFeatureState({ source: "states", id: selectedState }, { selected: true });
    appliedSelection.current = selected ? selectedState : null;

    if (skipNextFit.current) {
      skipNextFit.current = false;
      return;
    }
    if (previous === appliedSelection.current) return;
    map.fitBounds(selected ? featureBounds(selected) : LOWER_48_BOUNDS, { padding: 36, maxZoom: 7, duration: 900 });
  }, [selectedState, ready]);

  const jump = (bounds: Bounds) => mapRef.current?.fitBounds(bounds, { padding: 24, duration: 900 });

  if (status === "no-webgl" || status === "error") {
    return (
      <div className="em-map-fallback" role="status">
        <strong>{status === "no-webgl" ? "Interactive map unavailable" : "Map failed to load"}</strong>
        <span>{status === "no-webgl" ? "Your browser could not start WebGL." : "Map data could not be loaded."} Use the Location selector to choose a state.</span>
      </div>
    );
  }

  return (
    <div className="em-map-frame">
      <div ref={containerRef} className="em-map" role="region" aria-label="Interactive map of the United States. Use the Location selector for keyboard access." />
      {status === "loading" && <div className="em-map-loading" aria-hidden="true" />}
      <div className="em-map-jumps" role="group" aria-label="Map view">
        <button type="button" onClick={() => jump(LOWER_48_BOUNDS)}>Lower 48</button>
        <button type="button" onClick={() => jump(ALASKA_BOUNDS)}>Alaska</button>
        <button type="button" onClick={() => jump(HAWAII_BOUNDS)}>Hawaii</button>
      </div>
      {status === "basemap-fallback" && <span className="em-map-chip">Basemap unavailable · boundaries only</span>}
      {tooltip && (
        <div className="em-map-tooltip" style={{ left: tooltip.x, top: tooltip.y }} role="tooltip">
          <strong>{tooltip.title}</strong>
          {tooltip.lines.map((line) => <span key={line}>{line}</span>)}
        </div>
      )}
    </div>
  );
}

