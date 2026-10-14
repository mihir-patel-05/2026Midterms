import { lazy, Suspense, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { AppShell } from "@/components/shell/AppShell";
import type { MapTarget } from "@/features/election-monitor/map/ElectionMap";
import { stateFipsToPostal } from "@/features/election-monitor/map/fips";
import { usePastYear, type PresidentYear } from "@/features/election-monitor/pastResults";
import { ELECTORAL_VOTES } from "@/features/simulator/electoralVotes";
import { EvBar } from "@/features/simulator/EvBar";
import { pickLabel, sourceLabels, STATE_NAMES } from "@/features/simulator/labels";
import { CountyEditor } from "@/features/simulator/CountyEditor";
import { formatMargin, hasCountyShape, marginOf, nextPick, simBins, simulate, type Pick } from "@/features/simulator/model";
import { SimLegend } from "@/features/simulator/SimLegend";
import { SimulatorControls } from "@/features/simulator/SimulatorControls";
import { StateCountyEdits } from "@/features/simulator/StateCountyEdits";
import { StateEditor } from "@/features/simulator/StateEditor";
import { StateTable } from "@/features/simulator/StateTable";
import { useCountyNames } from "@/features/simulator/useCountyNames";
import { MAX_COUNTY_EDITS, useSimulatorParams, type SimLayer } from "@/features/simulator/useSimulatorParams";
// Eager, so the loading placeholder is sized before the lazy map chunk arrives.
import "@/features/election-monitor/map/electionMap.css";
import "@/features/simulator/simulator.css";

const ElectionMap = lazy(() => import("@/features/election-monitor/map/ElectionMap"));
const noop = () => {};
const NO_READINESS = {};
const NONE: string[] = [];

export default function ElectionSimulator() {
  const [params, update] = useSimulatorParams();
  const { scenario } = params;
  // Counties need a baseline's returns to start from; a blank map is states only.
  const layer: SimLayer = scenario.base === null ? "states" : params.layer;
  const yearQuery = usePastYear<PresidentYear>("president", scenario.base);
  const data = yearQuery.data && yearQuery.data.year === scenario.base ? yearQuery.data : null;
  const loading = scenario.base !== null && !data && !yearQuery.isError;

  const result = useMemo(() => simulate(scenario, data), [scenario, data]);
  const bins = useMemo(() => simBins(result, layer), [result, layer]);
  const paint = useMemo(() => ({ bins: loading ? null : bins }), [bins, loading]);
  const selected = params.state ? result.states[params.state] : null;
  const countyNames = useCountyNames(layer === "counties" || Object.keys(scenario.counties).length > 0);
  const countyName = (fips: string) => countyNames.data?.get(fips) ?? `County ${fips}`;
  const stateEdits = useMemo(
    () => (params.state ? Object.entries(scenario.counties).filter(([fips]) => stateFipsToPostal[fips.slice(0, 2)] === params.state) : []),
    [scenario.counties, params.state],
  );

  /** Picks with one state's call changed; null clears it. One URL update per action, since each update reads the URL as it was. */
  const withPick = useCallback((code: string, pick: Pick | null) => {
    const picks = { ...scenario.picks };
    if (pick) picks[code] = pick;
    else delete picks[code];
    return picks;
  }, [scenario.picks]);

  const withCounty = useCallback((fips: string, margin: number | null) => {
    const counties = { ...scenario.counties };
    if (margin === null) delete counties[fips];
    else counties[fips] = margin;
    return counties;
  }, [scenario.counties]);

  // On the states layer a click cycles the state's call; it also opens the state in the panel.
  const onMapState = useCallback((code: string) => {
    const state = result.states[code];
    if (!state) return;
    const computed = state.margin === null ? "T" : state.margin > 0 ? "D" : "R";
    update({
      ...(layer === "states" ? { scenario: { picks: withPick(code, nextPick(scenario.picks[code], computed)) } } : {}),
      state: code,
      county: null,
    });
  }, [layer, result.states, scenario.picks, withPick, update]);

  const onMapCounty = useCallback((state: string, fips: string) => update({ state, county: fips }), [update]);

  const describe = useCallback((target: MapTarget) => {
    if (target.kind === "county") {
      const margin = result.counties.get(target.fips);
      const votes = hasCountyShape(target.fips) ? data?.counties[target.fips] : undefined;
      const set = scenario.counties[target.fips];
      return {
        title: `${target.name}, ${target.state}`,
        lines: margin === undefined
          ? [target.state === "AK" ? "Alaska reports by state house district" : "No county returns", "Set the state as a whole instead"]
          : [
              `Simulated ${formatMargin(margin)}${set !== undefined ? " (set by you)" : ""}`,
              votes ? `${scenario.base}: ${formatMargin(marginOf(votes))}` : "",
              "Click to set its margin",
            ].filter(Boolean),
      };
    }
    const state = result.states[target.state];
    const name = STATE_NAMES[target.state] ?? target.state;
    if (!state) return { title: name, lines: [] };
    const pick = scenario.picks[target.state];
    return {
      title: `${name} · ${ELECTORAL_VOTES[target.state]} EV`,
      lines: [
        state.margin === null ? "Tossup" : `Simulated ${formatMargin(state.margin)}${state.source === "counties" ? ` (${sourceLabels.counties})` : ""}`,
        scenario.base !== null ? `${scenario.base}: ${formatMargin(state.baseMargin)}` : "",
        pick ? `Your call: ${pickLabel(pick)}` : "",
        layer === "states" ? "Click to change the call" : "",
      ].filter(Boolean),
    };
  }, [result, data, scenario.counties, scenario.picks, scenario.base, layer]);

  const copyLink = useCallback(() => {
    navigator.clipboard.writeText(window.location.href)
      .then(() => toast.success("Link copied", { description: "Anyone with it sees this exact map." }))
      .catch(() => toast.error("Could not copy the link", { description: "Copy it from the address bar instead." }));
  }, []);

  return (
    <AppShell variant="app">
      <div className="sim-shell">
        <section className="sim-main" aria-labelledby="sim-title">
          <header className="sim-head">
            <div>
              <h1 id="sim-title">Electoral college simulator</h1>
              <p>Start from a past presidential election, swing it, and call states yourself.</p>
            </div>
          </header>
          <SimulatorControls
            base={scenario.base}
            swing={scenario.swing}
            onBaseChange={(base) => update({ scenario: { base } })}
            onSwingChange={(swing) => update({ scenario: { swing } })}
            onReset={() => update({ scenario: { swing: 0, stateSwing: {}, counties: {}, picks: {}, districts: {} }, state: null, county: null })}
            onCopyLink={copyLink}
          />
          <EvBar totals={result.totals} loading={loading} />
          {params.truncated && <p className="sim-error" role="status">This link had more than {MAX_COUNTY_EDITS} county settings; only the first {MAX_COUNTY_EDITS} were kept.</p>}
          {yearQuery.isError && <p className="sim-error" role="alert">The {scenario.base} results could not be loaded. Try another year or a blank map.</p>}
          <section className="sim-map-card" aria-label="Simulated map">
            <div className="sim-map-toolbar">
              <div className="sim-seg" role="group" aria-label="Map shows">
                <button type="button" aria-pressed={layer === "states"} onClick={() => update({ layer: "states", county: null })}>States</button>
                <button type="button" aria-pressed={layer === "counties"} disabled={scenario.base === null} onClick={() => update({ layer: "counties" })}>Counties</button>
              </div>
              <p>
                {scenario.base === null
                  ? "Click a state to call it. Choose a past election to edit counties."
                  : layer === "states"
                    ? "Click a state to change its call."
                    : params.state ? "Click a county to set its margin." : "Click a county to set its margin and zoom to its state."}
              </p>
            </div>
            <Suspense fallback={<div className="em-map-frame"><div className="em-map-loading" /></div>}>
              <ElectionMap
                layer={layer}
                past={paint}
                readiness={NO_READINESS}
                selectedState={layer === "counties" ? params.state : null}
                selectedDistrict={null}
                selectedDistricts={NONE}
                selectedCounties={params.county ? [params.county] : NONE}
                initialView={null}
                describe={describe}
                onSelectState={onMapState}
                onSelectDistrict={noop}
                onSelectCounty={onMapCounty}
                onViewChange={noop}
              />
            </Suspense>
            <SimLegend />
          </section>
        </section>

        <aside className="sim-panel" aria-label="States">
          {selected && params.county && layer === "counties" && data ? (
            <CountyEditor
              key={params.county}
              name={countyName(params.county)}
              state={selected}
              baseMargin={hasCountyShape(params.county) && data.counties[params.county] ? marginOf(data.counties[params.county]) : null}
              margin={result.counties.get(params.county) ?? null}
              edited={params.county in scenario.counties}
              base={scenario.base!}
              onSet={(margin) => update({ scenario: { counties: withCounty(params.county!, margin) } })}
              onClearPick={() => update({ scenario: { picks: withPick(selected.code, null) } })}
              onClose={() => update({ county: null })}
            />
          ) : selected ? (
            <StateEditor
              key={selected.code}
              state={selected}
              pick={scenario.picks[selected.code]}
              base={scenario.base}
              onPick={(pick) => update({ scenario: { picks: withPick(selected.code, pick) } })}
              onClose={() => update({ state: null, county: null })}
            >
              {scenario.base !== null && (
                <StateCountyEdits
                  swing={scenario.stateSwing[selected.code] ?? 0}
                  edits={stateEdits}
                  names={countyNames.data}
                  onSwingChange={(swing) => update({ scenario: { stateSwing: { ...scenario.stateSwing, [selected.code]: swing } } })}
                  onSelectCounty={(fips) => update({ layer: "counties", county: fips })}
                  onResetCounty={(fips) => update({ scenario: { counties: withCounty(fips, null) } })}
                  onResetAll={() => update({ scenario: { counties: Object.fromEntries(Object.entries(scenario.counties).filter(([fips]) => !stateEdits.some(([edited]) => edited === fips))) } })}
                  onEditCounties={layer === "states" ? () => update({ layer: "counties" }) : undefined}
                />
              )}
            </StateEditor>
          ) : (
            <StateTable result={result} base={scenario.base} onSelect={(code) => update({ state: code, county: null })} />
          )}
          <p className="sim-source">
            Votes: MIT Election Data and Science Lab, County Presidential Election Returns 2000–2024. Swings move every county's
            margin by the same number of points; turnout stays as it was. A simulation, not a forecast.
          </p>
        </aside>
      </div>
    </AppShell>
  );
}
