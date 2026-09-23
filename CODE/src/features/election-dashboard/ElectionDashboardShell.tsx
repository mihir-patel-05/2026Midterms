import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Database, FlaskConical } from "lucide-react";
import { DashboardControls } from "./DashboardControls";
import { DataStateNotice } from "./DataStateNotice";
import { electionDashboardFixture, MOCK_NOTICE, stateMapItems } from "./fixtures";
import { NationalMap } from "./NationalMap";
import { RaceDetailPanel } from "./RaceDetailPanel";
import { RaceList } from "./RaceList";
import { SourceFreshnessIndicator } from "./SourceFreshnessIndicator";
import type { DashboardOfficeFilter, DashboardViewState } from "./types";
import "./election-dashboard.css";

function isStateCode(value: string | null) {
  return Boolean(value && stateMapItems.some((state) => state.code === value.toUpperCase()));
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
  const initialState = isStateCode(searchParams.get("state")) ? searchParams.get("state")!.toUpperCase() : "MI";
  const [stateCode, setStateCode] = useState(initialState);
  const [district, setDistrict] = useState(searchParams.get("district") ?? "07");
  const initialOffice = searchParams.get("office");
  const [office, setOffice] = useState<DashboardOfficeFilter>(
    isOfficeFilter(initialOffice) ? initialOffice : "ALL",
  );
  const [selectedContestId, setSelectedContestId] = useState(searchParams.get("contest") ?? electionDashboardFixture.contests[0].id);
  const [viewState, setViewState] = useState<DashboardViewState>("partial");

  const selectedState = stateMapItems.find((state) => state.code === stateCode) ?? stateMapItems[0];
  const filteredContests = electionDashboardFixture.contests.filter(
    (contest) => office === "ALL" || contest.officeType === office,
  );
  const selectedContest = filteredContests.find((contest) => contest.id === selectedContestId) ?? filteredContests[0] ?? electionDashboardFixture.contests[0];
  const selectedResult = electionDashboardFixture.results.find((result) => result.contestId === selectedContest.id);
  const candidates = electionDashboardFixture.candidates.filter((candidate) => selectedContest.candidateIds.includes(candidate.id));
  const previewHealth = viewState === "ready" ? "CURRENT" : viewState === "stale" ? "STALE" : viewState === "unavailable" ? "UNAVAILABLE" : "DEGRADED";
  const previewFreshness = viewState === "ready" || viewState === "partial" ? "FRESH" : viewState === "stale" ? "STALE" : "UNKNOWN";
  const previewCoverage = viewState === "unavailable" ? "NONE" : viewState === "partial" || viewState === "loading" ? "PARTIAL" : "COMPLETE";
  const previewResponseStatus = viewState === "unavailable" ? "UNAVAILABLE" : viewState === "partial" || viewState === "loading" ? "PARTIAL" : "AVAILABLE";

  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    next.set("state", stateCode);
    next.set("district", district);
    next.set("office", office);
    next.set("contest", selectedContest.id);
    if (next.toString() !== searchParams.toString()) setSearchParams(next, { replace: true });
  }, [district, office, searchParams, selectedContest.id, setSearchParams, stateCode]);

  function updateOffice(nextOffice: DashboardOfficeFilter) {
    setOffice(nextOffice);
    const firstMatch = electionDashboardFixture.contests.find(
      (contest) => nextOffice === "ALL" || contest.officeType === nextOffice,
    );
    if (firstMatch) setSelectedContestId(firstMatch.id);
  }

  return (
    <div className="ed-root">
      <header className="ed-topbar">
        <div><span className="ed-eyebrow">2026 beta foundation</span><h1>Election results dashboard</h1></div>
        <span className="ed-badge ed-badge-mock"><FlaskConical aria-hidden="true" /> Mock mode</span>
      </header>
      <div className="ed-mock-banner" role="note"><strong>Mock data:</strong> {MOCK_NOTICE}</div>

      <div className="ed-shell">
        <DashboardControls
          states={stateMapItems}
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
          <DataStateNotice state={viewState} />
          <div className="ed-summary" aria-label="Dashboard mock summary">
            <div><span>Selected state</span><strong>{selectedState.name}</strong></div>
            <div><span>Mock contests</span><strong>{filteredContests.length}</strong></div>
            <div><span>Result status</span><strong>{viewState === "unavailable" ? "Unavailable" : "Unofficial"}</strong></div>
            <div><span>Provider</span><strong>None licensed</strong></div>
          </div>
          <NationalMap states={stateMapItems} selectedState={stateCode} onSelect={setStateCode} />
          <RaceList
            contests={filteredContests}
            results={viewState === "loading" || viewState === "unavailable" ? [] : electionDashboardFixture.results}
            selectedContestId={selectedContest.id}
            stateName={selectedState.name}
            onSelect={setSelectedContestId}
          />
        </main>

        <aside className="ed-sidebar" aria-label="Selected contest detail and source status">
          {viewState !== "loading" && viewState !== "unavailable" ? (
            <RaceDetailPanel
              key={selectedContest.id}
              contest={selectedContest}
              result={selectedResult}
              candidates={candidates}
              finance={electionDashboardFixture.finance}
              stateName={selectedState.name}
              district={district}
            />
          ) : (
            <section className="ed-panel ed-empty-panel"><Database aria-hidden="true" /><h2>{viewState === "loading" ? "Waiting for fixture" : "No result snapshot"}</h2><p>{viewState === "loading" ? "The shell remains usable while mock data loads." : "Unavailable sources do not produce zero totals or implied results."}</p></section>
          )}
          <SourceFreshnessIndicator
            source={{ ...electionDashboardFixture.sourceStatus, health: previewHealth }}
            metadata={{
              ...electionDashboardFixture.metadata,
              freshness: previewFreshness,
              coverage: previewCoverage,
              responseStatus: previewResponseStatus,
            }}
          />
        </aside>
      </div>
    </div>
  );
}
