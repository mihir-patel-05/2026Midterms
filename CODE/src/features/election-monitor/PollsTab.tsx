import { BarChart3 } from "lucide-react";
import { RacePolls } from "@/features/polls/RacePolls";
import { raceCodeFor } from "@/features/polls/polls";
import { candidateNamesOf, districtLabel } from "./constants";
import type { MonitorContest } from "./types";

export function PollsTab({ contest }: { contest: MonitorContest | undefined }) {
  const race = contest && !contest.isFictional ? raceCodeFor(contest.office, contest.stateCode, contest.district) : null;
  let body;
  if (!contest) body = <div className="em-empty"><BarChart3 aria-hidden="true" /><strong>No contest selected</strong><span>Select a Senate or House contest to see its polls.</span></div>;
  else if (contest.isFictional) body = <div className="em-empty"><BarChart3 aria-hidden="true" /><strong>No polls</strong><span>Fictional contests have no polls.</span></div>;
  else body = <RacePolls race={race} candidateNames={candidateNamesOf(contest)} />;

  return (
    <section className="em-card" aria-labelledby="em-polls-heading">
      <h3 id="em-polls-heading">Polls{contest && !contest.isFictional ? ` · ${contest.office === "US_SENATE" ? `${contest.stateCode} Senate` : districtLabel(contest.stateCode, contest.district)}` : ""}</h3>
      <p>Published public polls of this race and a polling average computed from them.</p>
      {body}
    </section>
  );
}
