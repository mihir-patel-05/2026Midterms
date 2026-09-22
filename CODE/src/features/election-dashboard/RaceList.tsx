import { ChevronRight } from "lucide-react";
import type { ContestOfficeType, ContestResultViewModel, ContestViewModel } from "./types";

const officeLabels: Record<ContestOfficeType, string> = {
  US_HOUSE: "U.S. House",
  US_SENATE: "U.S. Senate",
  STATEWIDE_EXECUTIVE: "Statewide example",
  COUNTY_OFFICE: "County example",
  OTHER: "Other example",
};

export function RaceList({ contests, results, selectedContestId, stateName, onSelect }: {
  contests: ContestViewModel[];
  results: ContestResultViewModel[];
  selectedContestId: string;
  stateName: string;
  onSelect: (contestId: string) => void;
}) {
  return (
    <section className="ed-panel" aria-labelledby="race-list-heading">
      <div className="ed-panel-heading"><div><span className="ed-eyebrow">Mock race list</span><h2 id="race-list-heading">{stateName} demonstrations</h2></div><span className="ed-count">{contests.length}</span></div>
      {contests.length === 0 ? <p className="ed-empty">No fictional contests match this filter.</p> : (
        <div className="ed-race-list">
          {contests.map((contest) => {
            const result = results.find((item) => item.contestId === contest.id);
            const reporting = result?.reportingProgress.precincts.percentage;
            return (
              <button key={contest.id} type="button" aria-pressed={selectedContestId === contest.id} onClick={() => onSelect(contest.id)}>
                <span><small>{officeLabels[contest.officeType]}</small><strong>{contest.officeTitle.replace("Mock", stateName)}</strong><em>{result ? `${reporting === null ? "Unknown" : `${Math.round(reporting)}%`} mock reporting · ${result.status}` : "No mock snapshot · unavailable"}</em></span>
                <ChevronRight aria-hidden="true" />
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
