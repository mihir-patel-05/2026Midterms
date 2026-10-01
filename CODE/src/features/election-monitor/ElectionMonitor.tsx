import { lazy, Suspense, useCallback, useMemo } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { stateMapItems } from "@/features/election-dashboard/map";
import { mockResultsProviderEnabled } from "@/lib/featureFlags";
import { CanvasHeader } from "./CanvasHeader";
import { contestMatchesOffice, districtLabel, FICTIONAL_STATE_CODE, formatEtTime, numberFormat } from "./constants";
import { DetailPanel } from "./DetailPanel";
import { MapCard } from "./MapCard";
import { FinanceTab } from "./FinanceTab";
import { HistoryCard } from "./HistoryCard";
import { useMockResultsFeed, useResultsSourceStatus } from "./mockResults";
import { RaceCard } from "./RaceCard";
import { useStateContests, useStateCounts } from "./realData";
import { SemanticsCard } from "./SemanticsCard";
import { Sidebar } from "./Sidebar";
import { SnapshotCard } from "./SnapshotCard";
import { StatStrip } from "./StatStrip";
import type { MapTarget, MapView } from "./map/ElectionMap";
import type { MonitorStateSummary, OfficeFilter, Readiness } from "./types";
import { UnitsCard } from "./UnitsCard";
import { useMonitorParams } from "./useMonitorParams";
import "./monitor.css";

const ElectionMap = lazy(() => import("./map/ElectionMap"));

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
  const statesWithRaces = counts.data ? Object.values(counts.data).filter((value) => value > 0).length : null;
  const districts = [...new Set(stateContests.flatMap((contest) => (contest.office === "US_HOUSE" && contest.district ? [contest.district] : [])))].sort();
  const visibleContests = stateContests.filter(
    (contest) => contestMatchesOffice(contest, params.office) && (!params.district || contest.office !== "US_HOUSE" || contest.district === params.district),
  );
  const contest = visibleContests.find((item) => item.id === params.contest)
    ?? (params.district ? visibleContests.find((item) => item.office === "US_HOUSE" && item.district === params.district) : undefined)
    ?? visibleContests[0];
  const results = contest ? mockFeed.data?.resultsByContest[contest.id] : undefined;

  const selectState = useCallback((code: string | null) => update({ state: code, district: null, contest: null }), [update]);
  const onViewChange = useCallback((view: MapView) => update({ view }), [update]);
  const readiness = useMemo(() => Object.fromEntries(states.map((state) => [state.code, state.readiness])) as Record<string, Readiness>, [states]);
  const describe = useCallback((target: MapTarget) => {
    const state = states.find((item) => item.code === target.state);
    if (target.kind === "county") {
      return { title: `${target.name} County`, lines: [state?.name ?? target.state, "No county results source connected"] };
    }
    if (target.kind === "district") {
      const label = districtLabel(target.state, target.district);
      const onFile = target.state === selectedState?.code ? stateContests.find((item) => item.office === "US_HOUSE" && item.district === target.district) : undefined;
      return {
        title: label,
        lines: [onFile ? `${onFile.candidates.length} ${onFile.candidates.length === 1 ? "candidate" : "candidates"} on file` : target.state === selectedState?.code ? "No contest on file" : "Click to load this state's contests"],
      };
    }
    return {
      title: state?.name ?? target.state,
      lines: [
        state?.contests === null || state?.contests === undefined ? "Contest count not loaded" : `${state.contests} ${state.contests === 1 ? "race" : "races"} on file`,
        state?.readiness === "partial" ? "No candidates on file yet" : "",
      ].filter(Boolean),
    };
  }, [states, selectedState?.code, stateContests]);
  const selectDistrict = useCallback((state: string, district: string) => update({ state, district, contest: null }), [update]);

  return (
    <AppShell variant="app">
      <div className="em-shell">
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
          onDistrictChange={(district) => update({ district, contest: null })}
          onOfficeChange={(office) => update({ office, contest: null })}
          onLayerChange={(layer) => update({ layer })}
        />

        <section className="em-canvas" aria-labelledby="em-title">
          <CanvasHeader
            stateName={selectedState?.name ?? null}
            districtName={selectedState && params.district ? districtLabel(selectedState.code, params.district) : null}
            subtitle="State, congressional district, county, and campaign-finance drill-down"
            onReset={() => selectState(null)}
            onStateCrumb={() => update({ district: null, contest: null })}
          />
          <StatStrip
            stats={[
              { label: selectedState ? "Contests in view" : "Federal contests", value: selectedState ? (haveContests ? String(visibleContests.length) : "–") : nationalRaces === null ? "–" : numberFormat.format(nationalRaces) },
              { label: "Selected state", value: selectedState?.name ?? "United States" },
              { label: "House districts", value: haveContests ? String(districts.length) : "–" },
              { label: "Result status", value: results ? (results.meta.isMockData ? "Mock reporting" : "Reporting") : "No results feed" },
            ]}
          />
          <MapCard layer={params.layer} readout={`LAYER: ${params.layer.toUpperCase()}${params.view ? ` · ${params.view.lat.toFixed(2)}, ${params.view.lon.toFixed(2)} · Z${params.view.zoom.toFixed(1)}` : ""}`}>
            <Suspense fallback={<div className="em-map-frame"><div className="em-map-loading" /></div>}>
              <ElectionMap
                layer={params.layer}
                readiness={readiness}
                selectedState={selectedState && !selectedState.isFictional ? selectedState.code : null}
                selectedDistrict={params.district}
                initialView={params.view}
                describe={describe}
                onSelectState={selectState}
                onSelectDistrict={selectDistrict}
                onViewChange={onViewChange}
              />
            </Suspense>
          </MapCard>
        </section>

        <DetailPanel
          monogram={selectedState?.code ?? "US"}
          title={selectedState?.name ?? "United States"}
          meta={!selectedState ? "Select a state to begin" : contestsLoading ? "Loading contests…" : contestsError ? "Contests unavailable" : `${officeCounts.US_HOUSE} House · ${officeCounts.US_SENATE} Senate ${officeCounts.US_SENATE === 1 ? "contest" : "contests"}`}
          badge={results ? <span className="em-pill" data-tone={results.meta.isMockData ? "amber" : "teal"}>{results.meta.isMockData ? "Mock" : results.meta.freshness.toLowerCase()}</span> : null}
          tab={params.tab}
          onTabChange={(tab) => update({ tab })}
          overview={
            <>
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
          footer={results?.meta.isMockData ? "Results source: fictional mock fixtures. Values in result panels are illustrative and must not be interpreted as real election information." : "Candidate and finance records: Federal Election Commission. No live results provider is connected."}
        />
      </div>
    </AppShell>
  );
}
