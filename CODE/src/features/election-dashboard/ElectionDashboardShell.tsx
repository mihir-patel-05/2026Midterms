import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Database, FlaskConical } from "lucide-react";
import { DashboardControls } from "./DashboardControls";
import { DataStateNotice } from "./DataStateNotice";
import { stateMapItems } from "./map";
import { loadMockDashboard, type MockDashboardData } from "./mockApi";
import { NationalMap } from "./NationalMap";
import { RaceDetailPanel } from "./RaceDetailPanel";
import { RaceList } from "./RaceList";
import { SourceFreshnessIndicator } from "./SourceFreshnessIndicator";
import type { DashboardOfficeFilter, DashboardViewState } from "./types";
import "./election-dashboard.css";

function isStateCode(value: string | null) {
  return Boolean(value && (value.toUpperCase() === "EX" || stateMapItems.some((state) => state.code === value.toUpperCase())));
}

const officeFilters: DashboardOfficeFilter[] = [
  "ALL",
  "US_HOUSE",
  "US_SENATE",
  "STATEWIDE_EXECUTIVE",
  "COUNTY_OFFICE",
];

function isOfficeFilter(value: string | null): value is DashboardOfficeFilter {
  return Boolean(value && officeFilters.includes(value as DashboardOfficeFilter));
}

export function ElectionDashboardShell() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialState = isStateCode(searchParams.get("state")) ? searchParams.get("state")!.toUpperCase() : "EX";
  const [stateCode, setStateCode] = useState(initialState);
  const [district, setDistrict] = useState(searchParams.get("district") ?? "00");
  const initialOffice = searchParams.get("office");
  const [office, setOffice] = useState<DashboardOfficeFilter>(
    isOfficeFilter(initialOffice) ? initialOffice : "ALL",
  );
  const [selectedContestId, setSelectedContestId] = useState(searchParams.get("contest") ?? "");
  const [viewState, setViewState] = useState<DashboardViewState>("loading");
  const [dashboard, setDashboard] = useState<MockDashboardData | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    loadMockDashboard(controller.signal)
      .then((data) => { setDashboard(data); setViewState("ready"); })
      .catch((error) => { if (!controller.signal.aborted) { console.error("Mock dashboard load failed", error); setViewState("unavailable"); } });
    return () => controller.abort();
  }, []);

  const mockState = dashboard?.manifest?.states.find((state) => state.code === "EX");
  const displayStates = [
    ...stateMapItems,
    { code: "EX", name: mockState?.name ?? "Fictional Example State", row: 8, column: 12, coverage: mockState?.coverage ?? "UNKNOWN" as const },
  ];
  const selectedState = displayStates.find((state) => state.code === stateCode) ?? displayStates[0];
  const filteredContests = (dashboard?.contests ?? []).filter(
    (contest) => contest.jurisdiction.stateCode === stateCode && (office === "ALL" || contest.officeType === office),
  );
  const selectedContest = filteredContests.find((contest) => contest.id === selectedContestId) ?? filteredContests[0];
  const selectedResult = dashboard?.results.find((result) => result.contestId === selectedContest?.id);
  const candidates = (dashboard?.candidates ?? []).filter((candidate) => selectedContest?.candidateIds.includes(candidate.id));
  const selectedMetadata = selectedContest ? dashboard?.metadataByContest[selectedContest.id] : dashboard?.metadata;
  const displayState = viewState === "ready" && selectedMetadata
    ? selectedMetadata.freshness === "STALE" ? "stale" : selectedMetadata.responseStatus === "PARTIAL" ? "partial" : "ready"
    : viewState;
  const previewHealth = viewState === "ready" ? selectedMetadata?.source.health ?? "NOT_CONFIGURED" : viewState === "stale" ? "STALE" : viewState === "unavailable" ? "UNAVAILABLE" : "DEGRADED";
  const previewFreshness = viewState === "ready" ? selectedMetadata?.freshness ?? "UNKNOWN" : viewState === "partial" ? "FRESH" : viewState === "stale" ? "STALE" : "UNKNOWN";
  const previewCoverage = viewState === "ready" ? selectedMetadata?.coverage ?? "UNKNOWN" : viewState === "unavailable" ? "NONE" : "PARTIAL";
  const previewResponseStatus = viewState === "ready" ? selectedMetadata?.responseStatus ?? "UNAVAILABLE" : viewState === "unavailable" ? "UNAVAILABLE" : "PARTIAL";

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("state", stateCode);
    next.set("district", district);
    next.set("office", office);
    if (selectedContest) next.set("contest", selectedContest.id);
    else next.delete("contest");
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [district, office, searchParams, selectedContest?.id, setSearchParams, stateCode]);

  function updateOffice(nextOffice: DashboardOfficeFilter) {
    setOffice(nextOffice);
    const firstMatch = dashboard?.contests.find(
      (contest) => contest.jurisdiction.stateCode === stateCode && (nextOffice === "ALL" || contest.officeType === nextOffice),
    );
    if (firstMatch) setSelectedContestId(firstMatch.id);
  }

  return (
    <div className="ed-root">
      <header className="ed-topbar">
        <div><span className="ed-eyebrow">2026 beta foundation</span><h1>Election results dashboard</h1></div>
        <span className="ed-badge ed-badge-mock"><FlaskConical aria-hidden="true" /> Mock mode</span>
      </header>
      <div className="ed-mock-banner" role="note"><strong>Mock data:</strong> {selectedMetadata?.mockDisclaimer ?? "Fictional demonstration only. No live election results are connected."}</div>

      <div className="ed-shell">
        <DashboardControls
          states={displayStates}
          stateCode={stateCode}
          district={district}
          office={office}
          viewState={viewState}
          onStateChange={setStateCode}
          onDistrictChange={setDistrict}
          onOfficeChange={updateOffice}
          onViewStateChange={setViewState}
        />

        <main className="ed-main" id="election-dashboard-main">
          <DataStateNotice state={displayState} />
          <div className="ed-summary" aria-label="Dashboard mock summary">
            <div><span>Selected state</span><strong>{selectedState.name}</strong></div>
            <div><span>Mock contests</span><strong>{filteredContests.length}</strong></div>
            <div><span>Result status</span><strong>{viewState === "unavailable" ? "Unavailable" : "Unofficial"}</strong></div>
            <div><span>Provider</span><strong>None connected</strong></div>
          </div>
          <NationalMap states={displayStates} selectedState={stateCode} onSelect={setStateCode} />
          <RaceList
            contests={filteredContests}
            results={viewState === "loading" || viewState === "unavailable" ? [] : dashboard?.results ?? []}
            selectedContestId={selectedContest?.id ?? ""}
            stateName={selectedState.name}
            onSelect={setSelectedContestId}
          />
        </main>

        <aside className="ed-sidebar" aria-label="Selected contest detail and source status">
          {selectedContest && viewState !== "loading" && viewState !== "unavailable" ? (
            <RaceDetailPanel
              key={selectedContest.id}
              contest={selectedContest}
              result={selectedResult}
              candidates={candidates}
              finance={[]}
            />
          ) : (
            <section className="ed-panel ed-empty-panel"><Database aria-hidden="true" /><h2>{viewState === "loading" ? "Waiting for fixture" : "No result snapshot"}</h2><p>{viewState === "loading" ? "The shell remains usable while mock data loads." : "Unavailable sources do not produce zero totals or implied results."}</p></section>
          )}
          {selectedMetadata && <SourceFreshnessIndicator
            source={{ ...selectedMetadata.source, health: previewHealth }}
            metadata={{
              ...selectedMetadata,
              freshness: previewFreshness,
              coverage: previewCoverage,
              responseStatus: previewResponseStatus,
            }}
          />}
        </aside>
      </div>
    </div>
  );
}
