import { lazy, Suspense, useCallback, useMemo } from "react";
import { ArrowLeft, Link2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell/AppShell";
import { Slider } from "@/components/ui/slider";
import type { MapTarget } from "@/features/election-monitor/map/ElectionMap";
import { stateFipsToPostal } from "@/features/election-monitor/map/fips";
import { isRedistricted } from "@/features/election-monitor/map/redistricting";
import { BIN_COLORS, STATUS_COLORS, usePastYear, type HouseYear, type PresidentYear } from "@/features/election-monitor/pastResults";
import { CountyEditor } from "@/features/simulator/CountyEditor";
import { outcomeWords, pickLabel, sourceLabels, STATE_NAMES, swingLabel } from "@/features/simulator/labels";
import { formatMargin, marginOf, nextPick, type Outcome, type Pick } from "@/features/simulator/model";
import { HousePanel } from "@/features/simulator/midterms/HousePanel";
import { MidtermBars } from "@/features/simulator/midterms/MidtermBars";
import { NationalBaseline } from "@/features/simulator/midterms/NationalBaseline";
import { houseBins, nextSeatPick, senateBins, simulateHouse, simulateSenate } from "@/features/simulator/midterms/model";
import { districtName, isHouseDistrict, SENATE_RACES_2026, type SenateRace } from "@/features/simulator/midterms/races2026";
import { SenateTable } from "@/features/simulator/midterms/SenateTable";
import { useMidtermParams, type Chamber } from "@/features/simulator/midterms/useMidtermParams";
import { SimLegend } from "@/features/simulator/SimLegend";
import { SimulatorControls } from "@/features/simulator/SimulatorControls";
import { SimulatorTabs, type SimulatorPaths } from "@/features/simulator/SimulatorTabs";
import { StateCountyEdits } from "@/features/simulator/StateCountyEdits";
import { StateEditor } from "@/features/simulator/StateEditor";
import { useCountyNames } from "@/features/simulator/useCountyNames";
import { MAX_COUNTY_EDITS, SWING_LIMIT, type SimLayer } from "@/features/simulator/useSimulatorParams";
// Eager, so the loading placeholder is sized before the lazy map chunk arrives.
import "@/features/election-monitor/map/electionMap.css";
import "@/features/simulator/simulator.css";

const ElectionMap = lazy(() => import("@/features/election-monitor/map/ElectionMap"));
const noop = () => {};
const NO_READINESS = {};
const NONE: string[] = [];

/** "Mitch McConnell (R), not running" or "Jon Husted (R) · special election". */
function raceLine(race: SenateRace) {
  return [`${race.incumbent} (${race.holder})${race.open ? ", not running" : ""}`, race.special ? "special election" : ""].filter(Boolean).join(" · ");
}

/** The simulator without site chrome; `paths` points its tabs at the page it is embedded in (the War Room). */
export function MidtermSimulatorContent({ paths }: { paths?: SimulatorPaths }) {
  const [params, update] = useMidtermParams();
  const { chamber, senate, house } = params;
  // Counties need a baseline's returns to start from; a blank Senate map is states only.
  const senateLayer: SimLayer = senate.base === null ? "states" : params.layer;
  const mapLayer = chamber === "house" ? "districts" : senateLayer;

  const presidentQuery = usePastYear<PresidentYear>("president", senate.base);
  const presidentData = presidentQuery.data && presidentQuery.data.year === senate.base ? presidentQuery.data : null;
  const senateLoading = senate.base !== null && !presidentData && !presidentQuery.isError;
  const houseQuery = usePastYear<HouseYear>("house", house.base);
  const houseData = house.base !== null && houseQuery.data?.year === house.base ? houseQuery.data : null;
  const houseLoading = house.base !== null && !houseData && !houseQuery.isError;

  const senateResult = useMemo(() => simulateSenate(senate, presidentData), [senate, presidentData]);
  const houseResult = useMemo(() => simulateHouse(house.picks, houseData, house.swing), [house.picks, houseData, house.swing]);
  const paint = useMemo(() => {
    const colors = { colors: BIN_COLORS, fallback: STATUS_COLORS.not_reported };
    if (chamber === "house") return { bins: houseLoading ? null : houseBins(houseResult), ...colors };
    return { bins: senateLoading ? null : senateBins(senateResult, senateLayer), ...colors };
  }, [chamber, houseResult, houseLoading, senateResult, senateLoading, senateLayer]);

  const race = params.state ? senateResult.states[params.state] : null;
  const countyNames = useCountyNames(chamber === "senate" && (senateLayer === "counties" || Object.keys(senate.counties).length > 0));
  const countyName = (fips: string) => countyNames.data?.get(fips) ?? `County ${fips}`;
  const stateEdits = useMemo(
    () => (params.state ? Object.entries(senate.counties).filter(([fips]) => stateFipsToPostal[fips.slice(0, 2)] === params.state) : []),
    [senate.counties, params.state],
  );

  const withPick = useCallback((code: string, pick: Pick | null) => {
    const picks = { ...senate.picks };
    if (pick) picks[code] = pick;
    else delete picks[code];
    return picks;
  }, [senate.picks]);

  const withCounty = useCallback((fips: string, margin: number | null) => {
    const counties = { ...senate.counties };
    if (margin === null) delete counties[fips];
    else counties[fips] = margin;
    return counties;
  }, [senate.counties]);

  const setSeat = useCallback((code: string, winner: Outcome | null) => {
    const picks = { ...house.picks };
    if (winner) picks[code] = winner;
    else delete picks[code];
    update({ house: { picks } });
  }, [house.picks, update]);

  const setChamber = (next: Chamber) => update({ chamber: next, state: null, county: null, district: null });

  // Senate states layer: a click cycles a race's call and opens it in the panel.
  const onMapState = useCallback((code: string) => {
    const state = senateResult.states[code];
    const computed = !state || state.margin === null ? "T" : state.margin > 0 ? "D" : "R";
    update({
      ...(state && chamber === "senate" && senateLayer === "states" ? { senate: { picks: withPick(code, nextPick(senate.picks[code], computed)) } } : {}),
      state: code,
      county: null,
    });
  }, [chamber, senateLayer, senateResult.states, senate.picks, withPick, update]);

  const onMapCounty = useCallback((state: string, fips: string) => update({ state, county: fips }), [update]);

  // House: a click flips the seat without moving the map, so seats can be clicked in quick succession.
  const onMapDistrict = useCallback((state: string, district: string) => {
    const code = `${state}-${district}`;
    if (!isHouseDistrict(code)) return;
    const seat = houseResult.districts[code];
    const next = nextSeatPick(house.picks[code], seat.computed);
    const picks = { ...house.picks };
    if (next) picks[code] = next;
    else delete picks[code];
    update({ house: { picks }, district: code });
  }, [house.picks, houseResult.districts, update]);

  const describe = useCallback((target: MapTarget) => {
    if (target.kind === "district") {
      const code = `${target.state}-${target.district}`;
      const seat = houseResult.districts[code];
      if (!seat) return { title: code, lines: ["Not a voting House seat"] };
      const base = seat.baseWinner === null ? "" : seat.unopposed ? `${house.base}: ${seat.baseWinner} unopposed` : `${house.base}: ${formatMargin(seat.baseMargin)}`;
      return {
        title: districtName(code),
        lines: [
          seat.winner === "T" ? "Tossup" : `${outcomeWords[seat.winner]}${seat.source === "pick" ? " (your pick)" : ""}`,
          seat.margin !== null && house.swing !== 0 ? `Simulated ${formatMargin(seat.margin)} with the House swing` : "",
          base,
          isRedistricted(target.state) ? "New lines for 2026; these are the 2024 districts" : "",
          "Click to flip",
        ].filter(Boolean),
      };
    }
    if (target.kind === "county") {
      if (!SENATE_RACES_2026[target.state]) return { title: `${target.name}, ${target.state}`, lines: [`No Senate race in ${STATE_NAMES[target.state] ?? target.state} in 2026`] };
      const margin = senateResult.counties.get(target.fips);
      const votes = presidentData?.counties[target.fips];
      const set = senate.counties[target.fips];
      return {
        title: `${target.name}, ${target.state}`,
        lines: margin === undefined
          ? [target.state === "AK" ? "Alaska reports by state house district" : "No county returns", "Set the race as a whole instead"]
          : [
              `Simulated ${formatMargin(margin)}${set !== undefined ? " (set by you)" : ""}`,
              votes ? `${senate.base} president: ${formatMargin(marginOf(votes))}` : "",
              "Click to set its margin",
            ].filter(Boolean),
      };
    }
    const name = STATE_NAMES[target.state] ?? target.state;
    const info = SENATE_RACES_2026[target.state];
    const state = senateResult.states[target.state];
    if (!info || !state) return { title: name, lines: ["No Senate race in 2026"] };
    const pick = senate.picks[target.state];
    return {
      title: `${name} · Senate${info.special ? " (special)" : ""}`,
      lines: [
        raceLine(info),
        state.margin === null ? "Tossup" : `Simulated ${formatMargin(state.margin)}${state.source === "counties" ? ` (${sourceLabels.counties})` : ""}`,
        senate.base !== null ? `${senate.base} president: ${formatMargin(state.baseMargin)}` : "",
        pick ? `Your call: ${pickLabel(pick)}` : "",
        senateLayer === "states" ? "Click to change the call" : "",
      ].filter(Boolean),
    };
  }, [houseResult, house.base, house.swing, senateResult, presidentData, senate.counties, senate.picks, senate.base, senateLayer]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => toast.success("Link copied", { description: "Anyone with it sees this exact map." }))
      .catch(() => toast.error("Could not copy the link", { description: "Copy it from the address bar instead." }));
  }, []);

  const senatePanel = () => {
    if (race && params.county && senateLayer === "counties" && presidentData) {
      return (
        <CountyEditor
          key={params.county}
          name={countyName(params.county)}
          state={race}
          baseMargin={presidentData.counties[params.county] ? marginOf(presidentData.counties[params.county]) : null}
          margin={senateResult.counties.get(params.county) ?? null}
          edited={params.county in senate.counties}
          base={senate.base!}
          outcome={`the Senate seat goes to ${outcomeWords[race.winner]}`}
          onSet={(margin) => update({ senate: { counties: withCounty(params.county!, margin) } })}
          onClearPick={() => update({ senate: { picks: withPick(race.code, null) } })}
          onClose={() => update({ county: null })}
        />
      );
    }
    if (race) {
      const info = SENATE_RACES_2026[race.code];
      return (
        <StateEditor
          key={race.code}
          state={race}
          pick={senate.picks[race.code]}
          base={senate.base}
          backLabel="All races"
          summary={`${raceLine(info)} · ${race.winner === "T" ? "Tossup" : `${outcomeWords[race.winner]} win`} (${sourceLabels[race.source]})`}
          onPick={(pick) => update({ senate: { picks: withPick(race.code, pick) } })}
          onClose={() => update({ state: null, county: null })}
        >
          {senate.base !== null && (
            <StateCountyEdits
              swing={senate.stateSwing[race.code] ?? 0}
              edits={stateEdits}
              names={countyNames.data}
              onSwingChange={(swing) => update({ senate: { stateSwing: { ...senate.stateSwing, [race.code]: swing } } })}
              onSelectCounty={(fips) => update({ layer: "counties", county: fips })}
              onResetCounty={(fips) => update({ senate: { counties: withCounty(fips, null) } })}
              onResetAll={() => update({ senate: { counties: Object.fromEntries(Object.entries(senate.counties).filter(([fips]) => !stateEdits.some(([edited]) => edited === fips))) } })}
              onEditCounties={senateLayer === "states" ? () => update({ layer: "counties" }) : undefined}
            />
          )}
        </StateEditor>
      );
    }
    if (params.state) {
      return (
        <section className="sim-card" aria-labelledby="sim-norace-heading">
          <button type="button" className="sim-back" onClick={() => update({ state: null, county: null })}><ArrowLeft aria-hidden="true" />All races</button>
          <h2 id="sim-norace-heading">{STATE_NAMES[params.state] ?? params.state}</h2>
          <p className="sim-note">No Senate race here in 2026. Its senators count toward the seats not up.</p>
        </section>
      );
    }
    return <SenateTable result={senateResult} onSelect={(code) => update({ state: code, county: null })} />;
  };

  const hint = chamber === "house"
    ? "Click a district to flip it; click again to return it to its simulated result."
    : senate.base === null
      ? "Click a race to call it. Choose a past election to edit counties."
      : senateLayer === "states"
        ? "Click a race to change its call. Grey states have no Senate race."
        : params.state ? "Click a county to set its margin." : "Click a county to set its margin and zoom to its state.";

  return (
    <div className="sim-shell">
        <section className="sim-main" aria-labelledby="sim-title">
          <header className="sim-head">
            <SimulatorTabs paths={paths} />
            <div>
              <h1 id="sim-title">Midterm simulator</h1>
              <p>Swing the 2026 Senate races county by county, call House districts, and see who controls each chamber.</p>
            </div>
          </header>
          <MidtermBars senate={senateResult.totals} house={houseResult.totals} senateLoading={senateLoading} houseLoading={houseLoading} />
          <NationalBaseline
            senateBase={senate.base}
            houseBase={house.base}
            onApplySenate={(swing) => update({ senate: { swing } })}
            onApplyHouse={(swing) => update({ house: { swing } })}
          />
          {chamber === "senate" ? (
            <SimulatorControls
              base={senate.base}
              swing={senate.swing}
              baseLabel="Counties start from"
              note={senate.base === null ? "" : `County margins start from the ${senate.base} presidential vote, since there are no county-level Senate returns. Swings move every county in the race states by the same points.`}
              onBaseChange={(base) => update({ senate: { base } })}
              onSwingChange={(swing) => update({ senate: { swing } })}
              onReset={() => update({ senate: { swing: 0, stateSwing: {}, counties: {}, picks: {} }, state: null, county: null })}
              onCopyLink={copyLink}
            />
          ) : (
            <section className="sim-controls" aria-label="House scenario">
              <label className="sim-field">
                <span>Districts start from</span>
                <select value={house.base ?? "blank"} onChange={(event) => update({ house: { base: event.target.value === "blank" ? null : 2024 } })}>
                  <option value="2024">2024 winners</option>
                  <option value="blank">Blank map (all tossups)</option>
                </select>
              </label>
              <div className="sim-field sim-swing">
                <span id="sim-house-swing-label">House swing</span>
                <div className="sim-swing-row">
                  <span className="sim-swing-end" data-party="R" aria-hidden="true">R</span>
                  <Slider
                    aria-labelledby="sim-house-swing-label"
                    aria-valuetext={swingLabel(house.swing)}
                    min={-SWING_LIMIT}
                    max={SWING_LIMIT}
                    step={0.5}
                    value={[house.swing]}
                    disabled={house.base === null}
                    onValueChange={([value]) => update({ house: { swing: value } })}
                  />
                  <span className="sim-swing-end" data-party="D" aria-hidden="true">D</span>
                  <output className="sim-swing-value" aria-hidden="true">{swingLabel(house.swing)}</output>
                </div>
              </div>
              <div className="sim-actions">
                <button type="button" className="sim-button" onClick={() => update({ house: { picks: {}, swing: 0 }, state: null, district: null })}><RotateCcw aria-hidden="true" />Reset</button>
                <button type="button" className="sim-button" onClick={copyLink}><Link2 aria-hidden="true" />Copy link</button>
              </div>
              {house.base !== null && (
                <p className="sim-note">The swing moves every contested seat's 2024 margin by the same points; unopposed seats keep their winner.</p>
              )}
            </section>
          )}
          {params.truncated && <p className="sim-error" role="status">This link had more than {MAX_COUNTY_EDITS} county settings; only the first {MAX_COUNTY_EDITS} were kept.</p>}
          {chamber === "senate" && presidentQuery.isError && <p className="sim-error" role="alert">The {senate.base} results could not be loaded. Try another year or a blank map.</p>}
          {chamber === "house" && houseQuery.isError && <p className="sim-error" role="alert">The 2024 House results could not be loaded. Try a blank map.</p>}
          <section className="sim-map-card" aria-label="Simulated map">
            <div className="sim-map-toolbar">
              <div className="sim-seg" role="group" aria-label="Chamber">
                <button type="button" aria-pressed={chamber === "senate"} onClick={() => setChamber("senate")}>Senate</button>
                <button type="button" aria-pressed={chamber === "house"} onClick={() => setChamber("house")}>House</button>
              </div>
              {chamber === "senate" && (
                <div className="sim-seg" role="group" aria-label="Map shows">
                  <button type="button" aria-pressed={senateLayer === "states"} onClick={() => update({ layer: "states", county: null })}>States</button>
                  <button type="button" aria-pressed={senateLayer === "counties"} disabled={senate.base === null} onClick={() => update({ layer: "counties" })}>Counties</button>
                </div>
              )}
              <p>{hint}</p>
            </div>
            <Suspense fallback={<div className="em-map-frame"><div className="em-map-loading" /></div>}>
              <ElectionMap
                layer={mapLayer}
                overlay={paint}
                readiness={NO_READINESS}
                selectedState={mapLayer === "states" ? null : params.state}
                selectedDistrict={null}
                selectedDistricts={chamber === "house" && params.district && params.state === params.district.slice(0, 2) ? [params.district.slice(3)] : NONE}
                selectedCounties={params.county ? [params.county] : NONE}
                initialView={null}
                describe={describe}
                onSelectState={onMapState}
                onSelectDistrict={onMapDistrict}
                onSelectCounty={onMapCounty}
                onViewChange={noop}
              />
            </Suspense>
            <SimLegend note={chamber === "house" ? "Seats you set use the Likely shade; unopposed seats the Safe shade." : undefined} />
          </section>
        </section>

        <aside className="sim-panel" aria-label={chamber === "house" ? "House districts" : "Senate races"}>
          {chamber === "senate" ? senatePanel() : (
            <HousePanel
              result={houseResult}
              picks={house.picks}
              base={house.base}
              state={params.state}
              district={params.district}
              onPick={setSeat}
              onSelectState={(code) => update({ state: code })}
            />
          )}
          <p className="sim-source">
            {chamber === "house"
              ? "Seats: MIT Election Data and Science Lab, U.S. House 1976–2024, on the 119th Congress district lines. States that drew new maps for 2026 are approximate."
              : "Votes: MIT Election Data and Science Lab, County Presidential Election Returns 2000–2024, used as the starting point for each Senate race. Turnout stays as it was."}{" "}
            A simulation, not a forecast.
          </p>
        </aside>
    </div>
  );
}

export default function MidtermSimulator() {
  return (
    <AppShell variant="app">
      <MidtermSimulatorContent />
    </AppShell>
  );
}
