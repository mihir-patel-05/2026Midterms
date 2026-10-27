import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { stateMapItems } from "@/features/election-dashboard/map";
import { demographicsEnabled, mockResultsProviderEnabled, moversEnabled, oddsMapEnabled, pastResultsEnabled, newsEnabled } from "@/lib/featureFlags";
import { PredictionMarketsPanel } from "@/features/election-dashboard/PredictionMarketsPanel";
import { ActivityRail, type ActivityItem, type CoverageItem } from "./ActivityRail";
import { MoversCard } from "./MoversCard";
import { TopStoriesCard } from "./TopStoriesCard";
import { OddsControls, OddsLegend } from "./OddsControls";
import { CALLOUT_STATES, describeOddsRace, HATCH_BACKGROUND, ODDS_COLORS, ODDS_STATUS_COLORS, oddsLabels, useOddsView } from "./oddsMap";
import { PastResultsControls, PastResultsLegend } from "./PastResultsControls";
import { PastResultsTab } from "./PastResultsTab";
import { BIN_COLORS, describeResult, describeShift, STATUS_COLORS } from "./pastResults";
import { usePastResultsView } from "./usePastResultsView";
import { CanvasHeader } from "./CanvasHeader";
import { ControlOddsBanner } from "./ControlOddsBanner";
import { EconomyStrip } from "./EconomyStrip";
import { contestMatchesOffice, districtLabel, FICTIONAL_STATE_CODE, formatEtTime, numberFormat } from "./constants";
import { DemographicsTab } from "./DemographicsTab";
import { DetailPanel } from "./DetailPanel";
import { MapCard } from "./MapCard";
import { MapQuickControls } from "./MapQuickControls";
import { FinanceTab } from "./FinanceTab";
import { HistoryCard } from "./HistoryCard";
import { useMockResultsFeed, useResultsSourceStatus } from "./mockResults";
import { RaceCard } from "./RaceCard";
import { districtSelectionPatch, selectedDistricts, toggleItem } from "./selection";
import { useStateContests, useStateCounts } from "./realData";
import { SemanticsCard } from "./SemanticsCard";
import { Sidebar } from "./Sidebar";
import { SnapshotCard } from "./SnapshotCard";
import { StatStrip } from "./StatStrip";
import type { MapCallout, MapLabel, MapOverlay, MapTarget, MapView } from "./map/ElectionMap";
import { isRedistricted } from "./map/redistricting";
import type { MapLayer, MapMode, MonitorStateSummary, OfficeFilter, Readiness } from "./types";
import { UnitsCard } from "./UnitsCard";
import { useMonitorParams } from "./useMonitorParams";
// Prediction-market panel styles live with the legacy dashboard.
import "@/features/election-dashboard/election-dashboard.css";
import "./monitor.css";
// Eager, so the loading placeholder is sized before the lazy map chunk arrives.
import "./map/electionMap.css";

const ElectionMap = lazy(() => import("./map/ElectionMap"));
/** False on iPhone Safari and in iframes without permission; the button is hidden there. */
const fullscreenSupported = typeof document !== "undefined" && document.fullscreenEnabled;

export function ElectionMonitor() {
  const [params, update] = useMonitorParams();
  const mockFeed = useMockResultsFeed();
  const counts = useStateCounts();
  const sourceStatus = useResultsSourceStatus();
  const isFictionalSelection = params.state === FICTIONAL_STATE_CODE && mockResultsProviderEnabled;
  const realContests = useStateContests(isFictionalSelection ? null : params.state);

  const states = useMemo<MonitorStateSummary[]>(() => {
    const list: MonitorStateSummary[] = stateMapItems.map((item) => {
      const races = counts.data ? counts.data[item.code] ?? 0 : null;
      const loaded = params.state === item.code ? realContests.data : undefined;
      const readiness: Readiness = !races
        ? "pending"
        : loaded && loaded.length > 0 && loaded.every((contest) => contest.candidates.length === 0) ? "partial" : "ready";
      return { code: item.code, name: item.name, contests: races, readiness };
    });
    if (mockResultsProviderEnabled) {
      list.push({ code: FICTIONAL_STATE_CODE, name: mockFeed.data?.stateName ?? "Fictional Example State", contests: mockFeed.data?.contests.length ?? null, readiness: "partial", isFictional: true });
    }
    return list;
  }, [counts.data, mockFeed.data, params.state, realContests.data]);

  const selectedState = states.find((state) => state.code === params.state) ?? null;
  // FRED has no series for the fictional state; the strip stays national.
  const econStateCode = selectedState && !selectedState.isFictional ? selectedState.code : null;
  const stateContests = useMemo(
    () => (isFictionalSelection ? mockFeed.data?.contests ?? [] : realContests.data ?? []),
    [isFictionalSelection, mockFeed.data, realContests.data],
  );
  const contestsLoading = Boolean(selectedState) && (isFictionalSelection ? mockFeed.isLoading : realContests.isLoading);
  const contestsError = Boolean(selectedState) && (isFictionalSelection ? mockFeed.isError : realContests.isError);
  const haveContests = Boolean(selectedState) && !contestsLoading && !contestsError;
  const officeCounts: Record<OfficeFilter, number | null> = {
    ALL: haveContests ? stateContests.length : null,
    US_SENATE: haveContests ? stateContests.filter((contest) => contest.office === "US_SENATE").length : null,
    US_HOUSE: haveContests ? stateContests.filter((contest) => contest.office === "US_HOUSE").length : null,
  };
  const nationalRaces = counts.data ? Object.values(counts.data).reduce((sum, value) => sum + value, 0) : null;
  // DC and the territories elect House delegates but are not on the state map.
  const statesWithRaces = counts.data ? stateMapItems.filter((item) => (counts.data[item.code] ?? 0) > 0).length : null;
  const districts = [...new Set(stateContests.flatMap((contest) => (contest.office === "US_HOUSE" && contest.district ? [contest.district] : [])))].sort();
  const visibleContests = stateContests.filter(
    (contest) => contestMatchesOffice(contest, params.office) && (!params.district || contest.office !== "US_HOUSE" || contest.district === params.district),
  );
  const contest = visibleContests.find((item) => item.id === params.contest)
    ?? (params.district ? visibleContests.find((item) => item.office === "US_HOUSE" && item.district === params.district) : undefined)
    ?? visibleContests[0];
  const results = contest ? mockFeed.data?.resultsByContest[contest.id] : undefined;

  const pastActive = pastResultsEnabled && params.mode === "past";
  const past = usePastResultsView(
    pastActive,
    { office: params.pastOffice, year: params.pastYear, metric: params.pastMetric, from: params.pastFrom },
    params.layer === "counties",
  );
  const oddsActive = oddsMapEnabled && params.mode === "odds";
  const odds = useOddsView(oddsActive, params.oddsOffice);
  const mapMode: MapMode = pastActive ? "past" : oddsActive ? "odds" : "races";
  const extraModes = [...(pastResultsEnabled ? ["past" as const] : []), ...(oddsMapEnabled ? ["odds" as const] : [])];
  // In Past results the office decides the layer: states or counties for president, states for Senate,
  // districts for House. Market odds is by state for the Senate and by district for the House.
  const mapLayer: MapLayer = pastActive ? past.layer : oddsActive ? (params.oddsOffice === "senate" ? "states" : "districts") : params.layer;
  const oddsBins = odds.view?.bins ?? null;
  const oddsFlips = odds.view?.flips;
  const overlay = useMemo<MapOverlay | null>(() => {
    if (pastActive) return { bins: past.bins, colors: BIN_COLORS, fallback: STATUS_COLORS.not_reported };
    if (oddsActive) return { bins: oddsBins, colors: ODDS_COLORS, fallback: ODDS_STATUS_COLORS.no_market, redistricting: true, hatch: oddsFlips };
    return null;
  }, [pastActive, past.bins, oddsActive, oddsBins, oddsFlips]);
  // Senate odds label each state with its leader's price; small Northeast states are listed beside the map.
  const senateLabels = useMemo(() => {
    if (!oddsActive || params.oddsOffice !== "senate" || !odds.view) return null;
    const all = oddsLabels(odds.view);
    const labels: MapLabel[] = all.filter((item) => !CALLOUT_STATES.includes(item.code))
      .map((item) => ({ code: item.code, text: item.price ? `${item.code}\n${item.price}` : item.code, ink: item.ink }));
    const callouts: MapCallout[] = CALLOUT_STATES.flatMap((code) => {
      const item = all.find((label) => label.code === code);
      return item ? [{ code, text: item.price, ink: item.ink, background: item.hatch ? `${HATCH_BACKGROUND}, ${item.color}` : item.color }] : [];
    });
    return { labels, callouts };
  }, [oddsActive, params.oddsOffice, odds.view]);
  const setMode = useCallback((mode: MapMode) => {
    update(mode === "past" ? { mode, tab: "history" } : { mode, ...(params.tab === "history" ? { tab: "overview" as const } : {}) });
  }, [update, params.tab]);

  const expanded = params.expanded;
  const shellRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const setExpanded = useCallback((next: boolean) => {
    // Leaving the expanded map also leaves browser fullscreen, which only exists inside it.
    if (!next && document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    update({ expanded: next });
  }, [update]);
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
    else void shellRef.current?.requestFullscreen().catch(() => {});
  }, []);
  // The browser can end fullscreen on its own (Esc, F11), so follow its events rather than our clicks.
  useEffect(() => {
    if (!fullscreenSupported) return;
    const sync = () => setFullscreen(document.fullscreenElement !== null && document.fullscreenElement === shellRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, []);
  // Only the expanded map can tuck the detail panel away; the dashboard always shows it.
  const [panelCollapsed, setPanelCollapsed] = useState(false);
  const detailCollapsed = expanded && panelCollapsed;
  // While expanded the page behind the map must not scroll, and Esc goes back to the dashboard.
  useEffect(() => {
    if (!expanded) return;
    const root = document.documentElement;
    const previousOverflow = root.style.overflow;
    root.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      // In browser fullscreen, Esc belongs to the browser and only leaves fullscreen.
      if (event.key !== "Escape" || event.defaultPrevented || document.fullscreenElement) return;
      // Native selects and open menus use Esc themselves.
      if ((event.target as Element | null)?.closest?.("input, select, textarea, [role='listbox'], [role='menu'], [role='dialog']")) return;
      setExpanded(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      root.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded, setExpanded]);

  const selectState = useCallback((code: string | null) => update({ state: code, district: null, districts: [], counties: [], contest: null }), [update]);
  const onViewChange = useCallback((view: MapView) => update({ view }), [update]);
  const readiness = useMemo(() => Object.fromEntries(states.map((state) => [state.code, state.readiness])) as Record<string, Readiness>, [states]);
  const describe = useCallback((target: MapTarget) => {
    const state = states.find((item) => item.code === target.state);
    if (oddsActive && target.kind !== "county") {
      const code = target.kind === "district" ? `${target.state}-${target.district}` : target.state;
      const title = target.kind === "district" ? districtLabel(target.state, target.district) : state?.name ?? target.state;
      const office = params.oddsOffice;
      if (!odds.view) return { title, lines: ["Loading Kalshi markets…"] };
      return { title, lines: [`2026 ${office === "senate" ? "Senate" : "House"} · Kalshi market`, ...describeOddsRace(odds.view.races.get(code), office)] };
    }
    if (pastActive) {
      const title = target.kind === "county" ? target.name : target.kind === "district" ? districtLabel(target.state, target.district) : state?.name ?? target.state;
      const year = past.year;
      if (!past.lookup || year === null) return { title, lines: [past.error ? "Past results unavailable" : "Loading past results…"] };
      if (target.kind === "district" && !past.houseLinesMatch) return { title, lines: [`District lines were different in ${year}`, "Select to read its race in the panel"] };
      const [code, level]: [string, MapLayer] = target.kind === "county" ? [target.fips, "counties"] : target.kind === "district" ? [`${target.state}-${target.district}`, "districts"] : [target.state, "states"];
      const shift = past.lookup.shift(code, level);
      const result = past.lookup.result(code, level);
      // Alaska has no county results at all; say why rather than "not reported".
      const countyNote = target.kind === "county" && result.status === "not_reported" ? past.meta?.countyNotes[target.state] : undefined;
      const lines = countyNote ? [countyNote] : shift && past.from !== null ? describeShift(shift, past.from, year) : describeResult(result, past.data!.office, year);
      return { title: target.kind === "county" ? `${title}, ${target.state}` : title, lines: [`${year} ${past.data!.office === "president" ? "presidential" : past.data!.office === "senate" ? "Senate" : "House"}`, ...lines] };
    }
    if (target.kind === "county") {
      return { title: target.name, lines: [state?.name ?? target.state, "No county results source connected"] };
    }
    if (target.kind === "district") {
      const label = districtLabel(target.state, target.district);
      const onFile = target.state === selectedState?.code ? stateContests.find((item) => item.office === "US_HOUSE" && item.district === target.district) : undefined;
      return {
        title: label,
        lines: [
          onFile ? `${onFile.candidates.length} ${onFile.candidates.length === 1 ? "candidate" : "candidates"} on file` : target.state === selectedState?.code ? "No contest on file" : "Click to load this state's contests",
          isRedistricted(target.state) ? "Outline shows 2024 lines; this state redrew for 2026" : "",
        ].filter(Boolean),
      };
    }
    return {
      title: state?.name ?? target.state,
      lines: [
        state?.contests === null || state?.contests === undefined ? "Contest count not loaded" : `${state.contests} ${state.contests === 1 ? "race" : "races"} on file`,
        state?.readiness === "partial" ? "No candidates on file yet" : "",
      ].filter(Boolean),
    };
  }, [states, selectedState?.code, stateContests, pastActive, past, oddsActive, odds.view, params.oddsOffice]);
  const chosenDistricts = selectedDistricts(params);
  // Plain click selects one district; Shift-click adds or removes it. Another state starts over.
  const selectDistrict = useCallback((state: string, district: string, additive: boolean) => {
    if (state !== params.state) {
      update({ state, district, districts: [], counties: [], contest: null });
      return;
    }
    const next = additive ? toggleItem(selectedDistricts(params), district) : [district];
    update({ ...districtSelectionPatch(next, params.district), contest: null });
  }, [params, update]);
  const selectCounty = useCallback((state: string, fips: string, additive: boolean) => {
    // Counties have no 2026 race view, so a county click opens its demographics, or its past results in that mode.
    const tab = pastActive ? { tab: "history" as const } : demographicsEnabled ? { tab: "demographics" as const } : {};
    if (state !== params.state) {
      update({ state, district: null, districts: [], counties: [fips], contest: null, ...tab });
      return;
    }
    const alone = params.counties.length === 1 && params.counties[0] === fips;
    update({ counties: additive ? toggleItem(params.counties, fips) : alone ? [] : [fips], ...tab });
  }, [params, update, pastActive]);

  const activity = useMemo(() => {
    const items: ActivityItem[] = [];
    const iso = (ms: number) => new Date(ms).toISOString();
    if (counts.dataUpdatedAt) items.push({ at: iso(counts.dataUpdatedAt), tone: "teal", title: "Race counts refreshed", detail: `${numberFormat.format(nationalRaces ?? 0)} races across ${statesWithRaces ?? 0} states.` });
    if (counts.errorUpdatedAt && counts.isError) items.push({ at: iso(counts.errorUpdatedAt), tone: "danger", title: "Elections API unreachable", detail: "Counts are hidden rather than shown as zero." });
    if (selectedState && !isFictionalSelection && realContests.dataUpdatedAt) {
      const candidates = (realContests.data ?? []).reduce((sum, item) => sum + item.candidates.length, 0);
      items.push({ at: iso(realContests.dataUpdatedAt), tone: "blue", title: `${selectedState.name} contests loaded`, detail: `${realContests.data?.length ?? 0} general-election contests, ${candidates} candidates.` });
    }
    if (selectedState && !isFictionalSelection && realContests.isError && realContests.errorUpdatedAt) items.push({ at: iso(realContests.errorUpdatedAt), tone: "danger", title: `${selectedState.name} contests unavailable`, detail: "The elections API did not respond." });
    for (const source of sourceStatus.data ?? []) {
      items.push({ at: source.lastCheckedAt, tone: source.health === "CURRENT" ? "amber" : "danger", title: "Results source checked", detail: `${source.isMock ? "Fictional fixture" : source.name} · ${source.health.toLowerCase().replace("_", " ")}.` });
    }
    if (results) items.push({ at: results.updatedAt, tone: "amber", title: "Result snapshot", detail: `${results.meta.isMockData ? "Mock " : ""}${results.reportingPercent === null ? "reporting unknown" : `${results.reportingPercent.toFixed(1)}% reporting`}.` });
    return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 4);
  }, [counts.dataUpdatedAt, counts.errorUpdatedAt, counts.isError, nationalRaces, statesWithRaces, selectedState, isFictionalSelection, realContests.dataUpdatedAt, realContests.data, realContests.isError, realContests.errorUpdatedAt, sourceStatus.data, results]);

  const stats = [
    { label: selectedState ? "Contests in view" : "Federal contests", value: selectedState ? (haveContests ? String(visibleContests.length) : "–") : nationalRaces === null ? "–" : numberFormat.format(nationalRaces) },
    { label: "Selected state", value: selectedState?.name ?? "United States" },
    { label: "House districts", value: haveContests ? String(districts.length) : "–" },
    { label: "Result status", value: results ? (results.meta.isMockData ? "Mock reporting" : "Reporting") : "No results feed" },
  ];

  const coverage: CoverageItem[] = [
    { label: "States with races", ratio: statesWithRaces === null ? null : statesWithRaces / stateMapItems.length, note: "Loading" },
    ...(haveContests && stateContests.length > 0
      ? [
          { label: "Contests w/ candidates", ratio: stateContests.filter((item) => item.candidates.length > 0).length / stateContests.length },
          (() => {
            const all = stateContests.flatMap((item) => item.candidates);
            return { label: "Ballot confirmed", ratio: all.length ? all.filter((item) => item.ballotStatus !== "UNCONFIRMED").length / all.length : null, note: "No candidates" };
          })(),
        ]
      : []),
    { label: "Live results", ratio: null, note: mockResultsProviderEnabled ? "Mock fixtures only" : "No provider connected" },
  ];

  return (
    <AppShell variant="app">
      <div className="em-shell" ref={shellRef} data-map={expanded ? "expanded" : undefined} data-panel={detailCollapsed ? "collapsed" : undefined}>
        <Sidebar
          states={states}
          stateCode={selectedState?.code ?? null}
          districts={districts}
          district={params.district}
          office={params.office}
          officeCounts={officeCounts}
          layer={params.layer}
          health={{
            label: counts.isError ? "Down" : counts.isLoading ? "Checking" : "Online",
            tone: counts.isError ? "bad" : counts.isLoading ? "warn" : "good",
            rows: [
              { label: "Races on file", value: nationalRaces === null ? "–" : numberFormat.format(nationalRaces) },
              { label: "States covered", value: statesWithRaces === null ? "–" : String(statesWithRaces) },
              { label: "Results", value: mockResultsProviderEnabled ? "Mock fixtures" : "Not connected" },
              { label: "Last refresh", value: counts.dataUpdatedAt ? formatEtTime(new Date(counts.dataUpdatedAt).toISOString()) + " ET" : "–" },
            ],
          }}
          onStateChange={selectState}
          onDistrictChange={(district) => update({ district, districts: [], contest: null })}
          onOfficeChange={(office) => update({ office, contest: null })}
          onLayerChange={(layer) => update({ layer })}
        />

        <section className="em-canvas" aria-labelledby="em-title">
          <CanvasHeader
            stateName={selectedState?.name ?? null}
            districtName={selectedState && params.district ? districtLabel(selectedState.code, params.district) : null}
            subtitle="State, congressional district, county, and campaign-finance drill-down"
            onReset={() => selectState(null)}
            onStateCrumb={() => update({ district: null, districts: [], counties: [], contest: null })}
          />
          <ControlOddsBanner />
          <EconomyStrip stateCode={econStateCode} stateName={selectedState?.name ?? null} />
          <MapCard
            layer={mapLayer}
            readout={`LAYER: ${mapLayer.toUpperCase()}${params.view ? ` · ${params.view.lat.toFixed(2)}, ${params.view.lon.toFixed(2)} · Z${params.view.zoom.toFixed(1)}` : ""}`}
            mode={mapMode}
            modes={extraModes}
            expanded={expanded}
            onExpandedChange={setExpanded}
            fullscreen={fullscreen}
            onFullscreenToggle={fullscreenSupported ? toggleFullscreen : undefined}
            quickControls={
              <MapQuickControls
                states={states}
                stateCode={selectedState?.code ?? null}
                layer={params.layer}
                showLayers={mapMode === "races"}
                onStateChange={selectState}
                onLayerChange={(layer) => update({ layer })}
              />
            }
            // 2026 numbers; Past results has its own legend and detail tab, and market odds keeps the chamber odds.
            hud={mapMode === "odds" ? <ControlOddsBanner /> : mapMode === "races" && (
              <>
                <ControlOddsBanner />
                <EconomyStrip compact stateCode={econStateCode} stateName={selectedState?.name ?? null} />
                <StatStrip stats={stats} />
              </>
            )}
            onModeChange={setMode}
            modeControls={oddsActive ? (
              <OddsControls office={params.oddsOffice} view={odds.view} onChange={(oddsOffice) => update({ oddsOffice })} />
            ) : pastActive && (
              <PastResultsControls
                view={past}
                office={params.pastOffice}
                countyLevel={params.layer === "counties"}
                onChange={(patch) => update(patch)}
                onLevelChange={(counties) => update({ layer: counties ? "counties" : "states" })}
              />
            )}
            modeLegend={oddsActive ? <OddsLegend office={params.oddsOffice} view={odds.view} status={odds.status} holdersAsOf={odds.holdersAsOf} /> : pastActive && (
              <>
                {past.error && <p className="em-note" role="status">Past results could not be loaded.</p>}
                {params.pastOffice === "house" && past.year !== null && !past.houseLinesMatch && (
                  <p className="em-note" role="note">District lines in {past.year} differ from the outlines on the map, so districts are not coloured. Select a district to read its {past.year} race.</p>
                )}
                <PastResultsLegend view={past} office={params.pastOffice} />
              </>
            )}
          >
            <Suspense fallback={<div className="em-map-frame"><div className="em-map-loading" /></div>}>
              <ElectionMap
                layer={mapLayer}
                expanded={expanded}
                overlay={overlay}
                labels={senateLabels?.labels ?? null}
                // Zoomed into a state, the column would cover the map; it belongs to the national view.
                callouts={selectedState ? null : senateLabels?.callouts ?? null}
                readiness={readiness}
                selectedState={selectedState && !selectedState.isFictional ? selectedState.code : null}
                selectedDistrict={params.district}
                selectedDistricts={chosenDistricts}
                selectedCounties={params.counties}
                initialView={params.view}
                describe={describe}
                onSelectState={selectState}
                onSelectDistrict={selectDistrict}
                onSelectCounty={selectCounty}
                onViewChange={onViewChange}
              />
            </Suspense>
          </MapCard>
          <StatStrip stats={stats} />
          <ActivityRail activity={activity} coverage={coverage} coverageScope={selectedState && !isFictionalSelection ? `National · ${selectedState.code}` : "National"}>
            {newsEnabled && (
              <TopStoriesCard onSelect={(state, district) => update({ state, district, districts: [], counties: [], contest: null })} />
            )}
            {moversEnabled && (
              <MoversCard
                stateCode={selectedState && !selectedState.isFictional ? selectedState.code : null}
                onSelect={(state, district) => update({ state, district, districts: [], counties: [], contest: null })}
              />
            )}
            <PredictionMarketsPanel
              key={selectedState?.code ?? "US"}
              stateCode={selectedState && !selectedState.isFictional ? selectedState.code : null}
              district={selectedState && !selectedState.isFictional && params.district ? params.district : null}
              office={params.office}
            />
          </ActivityRail>
        </section>

        <DetailPanel
          monogram={selectedState?.code ?? "US"}
          title={selectedState?.name ?? "United States"}
          meta={!selectedState ? "Select a state to begin" : contestsLoading ? "Loading contests…" : contestsError ? "Contests unavailable" : `${officeCounts.US_HOUSE} House · ${officeCounts.US_SENATE} Senate ${officeCounts.US_SENATE === 1 ? "contest" : "contests"}`}
          badge={results ? <span className="em-pill" data-tone={results.meta.isMockData ? "amber" : "teal"}>{results.meta.isMockData ? "Mock" : results.meta.freshness.toLowerCase()}</span> : null}
          tab={(params.tab === "demographics" && !demographicsEnabled) || (params.tab === "history" && !pastActive) ? "overview" : params.tab}
          onTabChange={(tab) => update({ tab })}
          overview={
            <>
              {isRedistricted(selectedState?.code) && (
                <p className="em-note" role="note">
                  {selectedState!.name} adopted a new congressional map for 2026. District outlines on the map show the 2024 lines, so search your address to find your 2026 district.
                </p>
              )}
              <RaceCard contests={visibleContests} contest={contest} results={results} resultsAvailable={mockResultsProviderEnabled} loading={contestsLoading} error={contestsError} hasState={Boolean(selectedState)} onSelectContest={(id) => update({ contest: id })} />
              {selectedState && haveContests && stateContests.length > 0 && <SnapshotCard stateName={selectedState.name} contests={stateContests} />}
              {results && <HistoryCard results={results} sources={sourceStatus.data} />}
            </>
          }
          counties={
            <>
              <UnitsCard results={results} resultsAvailable={mockResultsProviderEnabled} heading={contest ? `County reporting · ${contest.district ? districtLabel(contest.stateCode, contest.district) : contest.stateCode}` : "County reporting"} />
              {results && <SemanticsCard results={results} />}
            </>
          }
          finance={<FinanceTab key={contest?.id ?? "none"} contest={contest} />}
          demographics={demographicsEnabled ? (
            <DemographicsTab
              stateCode={selectedState && !selectedState.isFictional ? selectedState.code : null}
              stateName={selectedState?.name ?? null}
              counties={params.counties}
              districts={chosenDistricts}
              districtOptions={districts}
              onCountiesChange={(counties) => update({ counties })}
              onDistrictsChange={(next) => update({ ...districtSelectionPatch(next, params.district), contest: null })}
              onClear={() => update({ counties: [], district: null, districts: [], contest: null })}
            />
          ) : undefined}
          history={pastActive ? (
            <PastResultsTab
              view={past}
              stateCode={selectedState && !selectedState.isFictional ? selectedState.code : null}
              stateName={selectedState?.name ?? null}
              district={params.district}
              county={params.counties[0] ?? null}
            />
          ) : undefined}
          collapsed={detailCollapsed}
          onCollapsedChange={expanded ? setPanelCollapsed : undefined}
          footer={results?.meta.isMockData ? "Results source: fictional mock fixtures. Values in result panels are illustrative and must not be interpreted as real election information." : "Candidate and finance records: Federal Election Commission. No live results provider is connected."}
        />
      </div>
    </AppShell>
  );
}
