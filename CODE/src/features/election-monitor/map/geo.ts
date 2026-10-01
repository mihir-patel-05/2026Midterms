import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";
import { feature } from "topojson-client";
import type { GeometryCollection, Topology } from "topojson-specification";
import countiesTopoUrl from "us-atlas/counties-10m.json?url";
import statesTopoUrl from "us-atlas/states-10m.json?url";
import { stateFipsToPostal } from "./fips";

export type Bounds = [[number, number], [number, number]];
export type StateFeature = Feature<Polygon | MultiPolygon, { code: string; name: string }>;
export type DistrictFeature = Feature<Polygon | MultiPolygon, { code: string; state: string; district: string }>;
export type CountyFeature = Feature<Polygon | MultiPolygon, { fips: string; name: string; state: string }>;
type Shapes<P> = FeatureCollection<Polygon | MultiPolygon, P>;

/** Built by `npm run build:geo` from Census 119th Congress cartographic boundaries; see public/geo/SOURCES.md. */
export const DISTRICTS_URL = `${import.meta.env.BASE_URL}geo/cd119.topo.json`;

export class GeometryMissingError extends Error {}

/** Lower 48 view used as the default and for "reset view". */
export const LOWER_48_BOUNDS: Bounds = [[-125, 24.2], [-66.8, 49.6]];
export const ALASKA_BOUNDS: Bounds = [[-179, 51], [-129.5, 71.5]];
export const HAWAII_BOUNDS: Bounds = [[-160.6, 18.8], [-154.6, 22.4]];

let statesPromise: Promise<Shapes<StateFeature["properties"]>> | null = null;
let countiesPromise: Promise<Shapes<CountyFeature["properties"]>> | null = null;
let districtsPromise: Promise<Shapes<DistrictFeature["properties"]>> | null = null;

async function fetchTopology<T>(url: string) {
  const response = await fetch(url);
  if (response.status === 404) throw new GeometryMissingError(url);
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  // A missing static file can come back as the SPA's index.html instead of a 404.
  if (!(response.headers.get("content-type") ?? "").includes("json")) throw new GeometryMissingError(url);
  return response.json() as Promise<T>;
}

/**
 * us-atlas states (Census cartographic boundaries, 1:10m), bundled as a
 * hashed static asset rather than fetched from a third-party CDN.
 */
export function loadStates() {
  statesPromise ??= fetch(statesTopoUrl)
    .then((response) => {
      if (!response.ok) throw new Error(`State geometry returned ${response.status}`);
      return response.json() as Promise<Topology<{ states: GeometryCollection<{ name: string }> }>>;
    })
    .then((topology) => {
      const collection = feature(topology, topology.objects.states) as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
      const features: StateFeature[] = [];
      for (const item of collection.features) {
        const code = stateFipsToPostal[String(item.id).padStart(2, "0")];
        if (code) features.push({ ...item, id: undefined, properties: { code, name: item.properties.name } });
      }
      return { type: "FeatureCollection" as const, features };
    })
    .catch((error) => {
      statesPromise = null;
      throw error;
    });
  return statesPromise;
}

/** us-atlas counties (1:10m), keyed by 5-digit FIPS. Only fetched when the counties layer is opened. */
export function loadCounties() {
  countiesPromise ??= fetchTopology<Topology<{ counties: GeometryCollection<{ name: string }> }>>(countiesTopoUrl)
    .then((topology) => {
      const collection = feature(topology, topology.objects.counties) as FeatureCollection<Polygon | MultiPolygon, { name: string }>;
      const features: CountyFeature[] = [];
      for (const item of collection.features) {
        const fips = String(item.id).padStart(5, "0");
        const state = stateFipsToPostal[fips.slice(0, 2)];
        if (state) features.push({ type: "Feature", geometry: item.geometry, properties: { fips, name: item.properties.name, state } });
      }
      return { type: "FeatureCollection" as const, features };
    })
    .catch((error) => {
      countiesPromise = null;
      throw error;
    });
  return countiesPromise;
}

export function loadDistricts() {
  districtsPromise ??= fetchTopology<Topology<{ districts: GeometryCollection<DistrictFeature["properties"]> }>>(DISTRICTS_URL)
    .then((topology) => feature(topology, topology.objects.districts) as Shapes<DistrictFeature["properties"]>)
    .catch((error) => {
      districtsPromise = null;
      throw error;
    });
  return districtsPromise;
}

/** Bounding box of a polygon feature. Alaska's Aleutians cross the antimeridian, so it gets a fixed view. */
export function featureBounds(item: Feature<Polygon | MultiPolygon, { code?: string; state?: string }>): Bounds {
  if (item.properties.code === "AK" || item.properties.state === "AK") return ALASKA_BOUNDS;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const visit = (ring: Position[]) => {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  };
  if (item.geometry.type === "Polygon") item.geometry.coordinates.forEach(visit);
  else item.geometry.coordinates.forEach((polygon) => polygon.forEach(visit));
  return [[minX, minY], [maxX, maxY]];
}
