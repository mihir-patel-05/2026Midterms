import { lazy, Suspense, useCallback, useMemo } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { stateMapItems } from "@/features/election-dashboard/map";
import { mockResultsProviderEnabled } from "@/lib/featureFlags";
import { CanvasHeader } from "./CanvasHeader";
import { contestMatchesOffice, districtLabel, FICTIONAL_STATE_CODE } from "./constants";
import { DetailPanel } from "./DetailPanel";
import { MapCard } from "./MapCard";
import { useMockResultsFeed } from "./mockResults";
import { RaceCard } from "./RaceCard";
import { Sidebar } from "./Sidebar";
import { StatStrip } from "./StatStrip";
import type { MapView } from "./map/ElectionMap";
import type { MonitorStateSummary, OfficeFilter, Readiness } from "./types";
import { UnitsCard } from "./UnitsCard";
import { useMonitorParams } from "./useMonitorParams";
import "./monitor.css";

const ElectionMap = lazy(() => import("./map/ElectionMap"));

export function ElectionMonitor() {
  const [params, update] = useMonitorParams();
  const mockFeed = useMockResultsFeed();

  const states = useMemo<MonitorStateSummary[]>(() => {
    const list: MonitorStateSummary[] = stateMapItems.map((item) => ({ code: item.code, name: item.name, contests: null, readiness: "pending" }));
    if (mockResultsProviderEnabled) {
      list.push({ code: FICTIONAL_STATE_CODE, name: mockFeed.data?.stateName ?? "Fictional Example State", contests: mockFeed.data?.contests.length ?? null, readiness: "partial", isFictional: true });
    }
    return list;
  }, [mockFeed.data]);

  const selectedState = states.find((state) => state.code === params.state) ?? null;
  const stateContests = useMemo(
    () => (mockFeed.data?.contests ?? []).filter((contest) => contest.stateCode === selectedState?.code),
    [mockFeed.data, selectedState?.code],
  );
  const officeCounts: Record<OfficeFilter, number | null> = {
    ALL: selectedState ? stateContests.length : null,
    US_SENATE: selectedState ? stateContests.filter((contest) => contest.office === "US_SENATE").length : null,
    US_HOUSE: selectedState ? stateContests.filter((contest) => contest.office === "US_HOUSE").length : null,
  };
  const districts = [...new Set(stateContests.flatMap((contest) => (contest.office === "US_HOUSE" && contest.district ? [contest.district] : [])))].sort();
  const visibleContests = stateContests.filter(
    (contest) => contestMatchesOffice(contest, params.office) && (!params.district || contest.office !== "US_HOUSE" || contest.district === params.district),
  );
  const contest = visibleContests.find((item) => item.id === params.contest) ?? visibleContests[0];
  const results = contest ? mockFeed.data?.resultsByContest[contest.id] : undefined;

  const selectState = useCallback((code: string | null) => update({ state: code, district: null, contest: null }), [update]);
  const onViewChange = useCallback((view: MapView) => update({ view }), [update]);
  const readiness = useMemo(() => Object.fromEntries(states.map((state) => [state.code, state.readiness])) as Record<string, Readiness>, [states]);
  const describeState = useCallback((code: string) => {
    const state = states.find((item) => item.code === code);
    return {
      title: state?.name ?? code,
      lines: [state?.contests === null || state?.contests === undefined ? "Contest count not loaded" : `${state.contests} federal contests`],
    };
  }, [states]);

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
            label: mockResultsProviderEnabled ? (mockFeed.isError ? "Down" : "Mock") : "None",
            tone: mockResultsProviderEnabled && !mockFeed.isError ? "warn" : "bad",
            rows: [
              { label: "Results", value: mockResultsProviderEnabled ? "Mock fixtures" : "Not connected" },
              { label: "Mock contests", value: mockFeed.data ? String(mockFeed.data.contests.length) : "–" },
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
              { label: "Contests in view", value: selectedState ? String(visibleContests.length) : "–" },
              { label: "Selected state", value: selectedState?.name ?? "United States" },
              { label: "House districts", value: selectedState ? String(districts.length) : "–" },
              { label: "Result status", value: results ? (results.meta.isMockData ? "Mock reporting" : "Reporting") : "No results feed" },
            ]}
          />
          <MapCard layer={params.layer} readout={`LAYER: ${params.layer.toUpperCase()}${params.view ? ` · ${params.view.lat.toFixed(2)}, ${params.view.lon.toFixed(2)} · Z${params.view.zoom.toFixed(1)}` : ""}`}>
            <Suspense fallback={<div className="em-map-frame"><div className="em-map-loading" /></div>}>
              <ElectionMap
                readiness={readiness}
                selectedState={selectedState && !selectedState.isFictional ? selectedState.code : null}
                initialView={params.view}
                describeState={describeState}
                onSelectState={selectState}
                onViewChange={onViewChange}
              />
            </Suspense>
          </MapCard>
        </section>

        <DetailPanel
          monogram={selectedState?.code ?? "US"}
          title={selectedState?.name ?? "United States"}
          meta={selectedState ? `${officeCounts.US_HOUSE ?? 0} House · ${officeCounts.US_SENATE ?? 0} Senate contests` : "Select a state to begin"}
          badge={results ? <span className="em-pill" data-tone={results.meta.isMockData ? "amber" : "teal"}>{results.meta.isMockData ? "Mock" : results.meta.freshness.toLowerCase()}</span> : null}
          tab={params.tab}
          onTabChange={(tab) => update({ tab })}
          overview={<RaceCard contests={visibleContests} contest={contest} results={results} resultsAvailable={mockResultsProviderEnabled} onSelectContest={(id) => update({ contest: id })} />}
          counties={<UnitsCard results={results} resultsAvailable={mockResultsProviderEnabled} heading={contest ? `County reporting · ${contest.district ? districtLabel(contest.stateCode, contest.district) : contest.stateCode}` : "County reporting"} />}
          finance={<section className="em-card"><h3>Candidate finance</h3><p>Select a contest to compare its candidates' FEC filings.</p></section>}
          footer={results?.meta.isMockData ? "Results source: fictional mock fixtures. Values in result panels are illustrative and must not be interpreted as real election information." : "Candidate and finance records: Federal Election Commission. No live results provider is connected."}
        />
      </div>
    </AppShell>
  );
}
