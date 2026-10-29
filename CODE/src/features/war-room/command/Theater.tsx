import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { districtLabel } from "@/features/election-monitor/constants";
import { featureBounds, loadDistricts, loadStates, type Bounds } from "@/features/election-monitor/map/geo";
import type { MapCallout, MapLabel, MapOverlay, MapTarget, MapTheme, MapView } from "@/features/election-monitor/map/ElectionMap";
import { CALLOUT_STATES, describeOddsRace, HATCH_BACKGROUND, ODDS_COLORS, ODDS_STATUS_COLORS, oddsLabels, type OddsView } from "@/features/election-monitor/oddsMap";
import { districtSelectionPatch, selectedDistricts, toggleItem } from "@/features/election-monitor/selection";
import type { MapLayer, Readiness } from "@/features/election-monitor/types";
import type { MonitorParams } from "@/features/election-monitor/useMonitorParams";
import { HOUSE_SEATS, SENATE_RACE_CODES } from "@/features/simulator/midterms/races2026";
import { etClock } from "../countdown";
import { CLOSE_BELOW, FLIP_COLORS, flipCounts, flipOverlay, HOLDER_COLORS, holderOverlay } from "../holderOverlay";
import { Brackets } from "../panels/Panel";
import { STATE_NAMES, raceLabel } from "../raceCodes";
import { cents } from "../seatTally";
import { LENSES, type Lens } from "../theater";
import type { Board } from "../useBoard";
// Eager, so the placeholder is sized before the lazy map chunk arrives.
import "@/features/election-monitor/map/electionMap.css";

const ElectionMap = lazy(() => import("@/features/election-monitor/map/ElectionMap"));

/** Amber selection and quiet lines on the War Room ground. */
const MAP_THEME: Partial<MapTheme> = {
  primary: "#3dd6d0", county: "#5aa9ff", warning: "#ffb020", quiet: "#2b333d", line: "#2a3542", soft: "#5a6675",
  selection: "#ffb020", overlaySelection: "#ffb020", overlayLine: "#06080b",
};
const NO_READINESS: Record<string, Readiness> = {};
const LAYERS: Array<{ id: MapLayer; label: string }> = [{ id: "states", label: "States" }, { id: "districts", label: "Districts" }, { id: "counties", label: "Counties" }];
const CLOSEST = 9;

/** The selected race's outline on the map, from the same cached geometry the map loads. */
function useTargetBounds(state: string | null, district: string | null, layer: MapLayer) {
  const [bounds, setBounds] = useState<Bounds | null>(null);
  useEffect(() => {
    let live = true;
    setBounds(null);
    if (!state) return;
    const find = layer === "districts" && district
      ? loadDistricts().then((data) => data.features.find((item) => item.properties.code === `${state}-${district}`))
      : loadStates().then((data) => data.features.find((item) => item.properties.code === state));
    find.then((item) => { if (live && item) setBounds(featureBounds(item)); }).catch(() => {});
    return () => { live = false; };
  }, [state, district, layer]);
  return bounds;
}

/** Targeting brackets around the selected race, positioned with map.project() and moved with the map. */
function TargetBrackets({ map, bounds, label, frame }: { map: MapLibreMap | null; bounds: Bounds | null; label: string; frame: RefObject<HTMLDivElement> }) {
  const [box, setBox] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  useEffect(() => {
    if (!map || !bounds) {
      setBox(null);
      return;
    }
    const place = () => {
      const base = frame.current?.getBoundingClientRect();
      const container = map.getContainer().getBoundingClientRect();
      if (!base) return;
      const nw = map.project([bounds[0][0], bounds[1][1]]);
      const se = map.project([bounds[1][0], bounds[0][1]]);
      const pad = 6;
      let width = Math.abs(se.x - nw.x) + pad * 2;
      let height = Math.abs(se.y - nw.y) + pad * 2;
      let left = Math.min(nw.x, se.x) - pad;
      let top = Math.min(nw.y, se.y) - pad;
      // A small district still gets a readable frame.
      if (width < 28) { left -= (28 - width) / 2; width = 28; }
      if (height < 28) { top -= (28 - height) / 2; height = 28; }
      const offscreen = left > container.width || top > container.height || left + width < 0 || top + height < 0;
      setBox(offscreen ? null : { left: left + container.left - base.left, top: top + container.top - base.top, width, height });
    };
    place();
    map.on("move", place);
    map.on("resize", place);
    return () => {
      map.off("move", place);
      map.off("resize", place);
    };
  }, [map, bounds, frame]);
  if (!box) return null;
  return (
    <div className="wr-target-frame" data-inside={box.top < 64 || undefined} style={{ ...box, "--wr-brk": `${Math.max(8, Math.min(18, box.width / 5))}px` } as CSSProperties} aria-hidden="true">
      <Brackets />
      <span className="wr-target-tag">TGT // {label}</span>
    </div>
  );
}

function Swatch({ color, hatch, outline }: { color: string; hatch?: boolean; outline?: string }) {
  return <span className="wr-swatch" style={{ background: hatch ? `${HATCH_BACKGROUND}, ${color}` : color, borderColor: outline }} aria-hidden="true" />;
}

function Legend({ lens, layer, view, house }: { lens: Lens; layer: MapLayer; view: OddsView | null; house: boolean }) {
  if (layer === "counties") return <div className="wr-legend"><span>Counties have no 2026 race. Pick States or Districts to colour the map.</span></div>;
  const counts = lens === "flip" && view ? flipCounts(view) : null;
  return (
    <div className="wr-legend">
      <span className="wr-legend-key">Legend</span>
      {lens === "leader" && (
        <>
          <span>{[3, 2, 1, 0].map((i) => <Swatch key={i} color={ODDS_COLORS[`D${i}`]} />)}D leads</span>
          <span>{[3, 2, 1, 0].map((i) => <Swatch key={i} color={ODDS_COLORS[`R${i}`]} />)}R leads</span>
          <span className="wr-legend-quiet">Shade ≥90 · 75 · 60 · &lt;60¢</span>
          <span><Swatch color="#5a6675" hatch />Leader ≠ seat holder</span>
          <span><Swatch color={ODDS_STATUS_COLORS.no_market} />No market or no price</span>
          {!house && <span><Swatch color={ODDS_STATUS_COLORS.no_race} />No Senate race</span>}
        </>
      )}
      {lens === "holder" && (
        <>
          <span><Swatch color={HOLDER_COLORS.D} />D-held</span>
          <span><Swatch color={HOLDER_COLORS.R} />R-held</span>
          <span><Swatch color={HOLDER_COLORS["D-open"]} /><Swatch color={HOLDER_COLORS["R-open"]} />{house ? "Vacant, by last holder" : "Open seat, incumbent not running"}</span>
          {house ? <span><Swatch color={HOLDER_COLORS.unknown} />Holder not loaded</span> : <span><Swatch color={HOLDER_COLORS.no_race} />No Senate race</span>}
        </>
      )}
      {lens === "flip" && (
        <>
          <span><Swatch color={FLIP_COLORS.flip} hatch />Leader ≠ seat holder{counts ? ` · ${counts.flips}` : ""}</span>
          <span><Swatch color={FLIP_COLORS.close} />Leader under {CLOSE_BELOW}¢{counts ? ` · ${counts.close}` : ""}</span>
          <span><Swatch color={FLIP_COLORS.safe} />Leader {CLOSE_BELOW}¢ or more</span>
          <span><Swatch color={FLIP_COLORS.unpriced} outline="#263241" />No market or no price</span>
        </>
      )}
      {house && <span><Swatch color="transparent" outline="var(--wr-accent)" />Dashed: redrawn for 2026, shapes are 2024 lines</span>}
      <span className="wr-legend-note">Kalshi prices, not forecasts</span>
    </div>
  );
}

export interface TheaterProps {
  params: MonitorParams;
  update: (patch: Partial<MonitorParams>) => void;
  lens: Lens;
  onLens: (lens: Lens) => void;
  onLayer: (layer: MapLayer) => void;
  layer: MapLayer;
  board: Board;
  /** The race on the target card, or null. */
  target: string | null;
}

/** The Command map: the shared MapLibre ElectionMap, coloured by one of three lenses, with the target bracketed. */
export function Theater({ params, update, lens, onLens, onLayer, layer, board, target }: TheaterProps) {
  const house = layer === "districts";
  const view = house ? board.house : layer === "states" ? board.senate : null;
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const bounds = useTargetBounds(params.state, params.district, layer);

  const overlay = useMemo<MapOverlay | null>(() => {
    if (layer === "counties") return null;
    if (lens === "holder") return holderOverlay(house ? "house" : "senate", board.holders);
    if (lens === "flip") return flipOverlay(view);
    return { bins: view?.bins ?? null, colors: ODDS_COLORS, fallback: ODDS_STATUS_COLORS.no_market, redistricting: true, hatch: view?.flips };
  }, [layer, lens, house, board.holders, view]);

  // Senate prices label each state; the small Northeast states are listed beside the map, as on the monitor.
  const senateLabels = useMemo(() => {
    if (layer !== "states" || lens !== "leader" || !view) return null;
    const all = oddsLabels(view);
    const labels: MapLabel[] = all.filter((item) => !CALLOUT_STATES.includes(item.code))
      .map((item) => ({ code: item.code, text: item.price ? `${item.code}\n${item.price.replace("%", "¢")}` : item.code, ink: item.ink }));
    const callouts: MapCallout[] = CALLOUT_STATES.flatMap((code) => {
      const item = all.find((label) => label.code === code);
      return item ? [{ code, text: item.price.replace("%", "¢"), ink: item.ink, background: item.hatch ? `${HATCH_BACKGROUND}, ${item.color}` : item.color }] : [];
    });
    return { labels, callouts };
  }, [layer, lens, view]);

  const describe = useCallback((item: MapTarget) => {
    if (item.kind === "county") return { title: `${item.name}, ${item.state}`, lines: ["No 2026 race by county"] };
    const isHouse = item.kind === "district";
    const code = isHouse ? `${item.state}-${item.district}` : item.state;
    const title = isHouse ? districtLabel(item.state, item.district) : STATE_NAMES[item.state] ?? item.state;
    const source = isHouse ? board.house : board.senate;
    if (!source) return { title, lines: ["Waiting for Kalshi prices…"] };
    return { title, lines: [`2026 ${isHouse ? "House" : "Senate"} · Kalshi`, ...describeOddsRace(source.races.get(code), isHouse ? "house" : "senate")] };
  }, [board.house, board.senate]);

  const selectState = useCallback((code: string | null) => update({ state: code, district: null, districts: [], counties: [], contest: null }), [update]);
  const selectDistrict = useCallback((state: string, district: string, additive: boolean) => {
    if (state !== params.state) return update({ state, district, districts: [], counties: [], contest: null });
    const next = additive ? toggleItem(selectedDistricts(params), district) : [district];
    update({ ...districtSelectionPatch(next, params.district), contest: null });
  }, [params, update]);
  const selectCounty = useCallback((state: string, fips: string, additive: boolean) => {
    if (state !== params.state) return update({ state, district: null, districts: [], counties: [fips], contest: null });
    update({ counties: additive ? toggleItem(params.counties, fips) : [fips] });
  }, [params, update]);
  const onViewChange = useCallback((next: MapView) => update({ view: next }), [update]);

  const closest = view
    ? [...view.races.values()].filter((race) => race.leader && race.bin !== "no_race").sort((a, b) => a.leader!.price - b.leader!.price || a.code.localeCompare(b.code)).slice(0, CLOSEST)
    : [];
  const tag = house
    ? `Theater // U.S. House 2026 · ${HOUSE_SEATS} seats${view ? ` · ${view.priced} priced` : ""}`
    : layer === "states" ? `Theater // U.S. Senate 2026 · ${SENATE_RACE_CODES.length} races` : "Theater // Counties";
  const lensInfo = LENSES.find((item) => item.id === lens)!;
  const lastTick = [board.senate?.lastChange, board.house?.lastChange].filter((at): at is string => Boolean(at)).sort().pop();

  return (
    <section id="theater" className="wr-panel wr-theater" aria-labelledby="wr-theater-title">
      <Brackets />
      <div className="wr-theater-head">
        <div>
          <div className="wr-eyebrow">{tag}</div>
          <h2 id="wr-theater-title" className="wr-section-title">{layer === "counties" ? "Counties" : house ? lensInfo.house : lensInfo.senate}</h2>
        </div>
        <div className="wr-seg" role="group" aria-label="Map lens">
          {LENSES.map((item) => (
            <button key={item.id} type="button" aria-pressed={item.id === lens} disabled={layer === "counties"} onClick={() => onLens(item.id)}>{item.label}</button>
          ))}
        </div>
      </div>

      <div className="wr-theater-body">
        <div className="wr-map-wrap" ref={frame}>
          <Suspense fallback={<div className="em-map-frame"><div className="em-map-loading" /></div>}>
            <ElectionMap
              layer={layer}
              theme={MAP_THEME}
              overlay={overlay}
              labels={senateLabels?.labels ?? null}
              callouts={params.state ? null : senateLabels?.callouts ?? null}
              readiness={NO_READINESS}
              selectedState={params.state}
              selectedDistrict={params.district}
              selectedDistricts={selectedDistricts(params)}
              selectedCounties={params.counties}
              initialView={params.view}
              describe={describe}
              onSelectState={selectState}
              onSelectDistrict={selectDistrict}
              onSelectCounty={selectCounty}
              onViewChange={onViewChange}
              onMap={setMap}
            />
          </Suspense>
          {target && <TargetBrackets map={map} bounds={bounds} label={raceLabel(target)} frame={frame} />}
          <div className="wr-map-layers wr-seg" role="group" aria-label="Map layer">
            {LAYERS.map((item) => <button key={item.id} type="button" aria-pressed={item.id === layer} onClick={() => onLayer(item.id)}>{item.label}</button>)}
          </div>
        </div>
        {closest.length > 0 && (
          <div className="wr-closest" role="group" aria-label={`Closest ${house ? "House" : "Senate"} races`}>
            <div className="wr-closest-head">Closest</div>
            {closest.map((race) => {
              const code = house ? race.code : `${race.code}-SEN`;
              const selected = house ? params.state === race.code.slice(0, 2) && params.district === race.code.slice(3) : params.state === race.code;
              return (
                <button key={race.code} type="button" aria-pressed={selected}
                  aria-label={`${raceLabel(code)}: ${race.leader!.market.outcome} leads at ${cents(race.leader!.price)}. Target it`}
                  onClick={() => (house ? update({ state: race.code.slice(0, 2), district: race.code.slice(3), districts: [], counties: [], contest: null }) : selectState(race.code))}>
                  <Swatch color={ODDS_COLORS[race.bin] ?? ODDS_STATUS_COLORS.no_market} hatch={race.flip} />
                  <strong>{raceLabel(code)}</strong>
                  <span>{race.leader!.party === "O" ? "I" : race.leader!.party} {cents(race.leader!.price)}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <Legend lens={lens} layer={layer} view={view} house={house} />
      <div className="wr-theater-foot">
        <span>Layer: {layer} · Src Kalshi {board.status === "live" ? "live" : board.status}{view?.priceType ? ` · ${view.priceType}` : ""}</span>
        <span>Sel: {target ? raceLabel(target) : params.state ?? "none"} · Last tick {lastTick ? `${etClock(Date.parse(lastTick))} ET` : "—"}</span>
      </div>
    </section>
  );
}

