import { useQuery } from "@tanstack/react-query";
import { BadgeDollarSign, CloudOff, Database, Loader2 } from "lucide-react";
import { fecIndependentExpendituresUrl, getRaceOutsideSpending } from "@/lib/api";
import { committeeName, displayName, formatShortDate } from "./constants";
import { MONITOR_CYCLE } from "./realData";
import type { MonitorContest } from "./types";

const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const money = (value: number) => compact.format(value);

function Empty({ icon: Icon, title, copy, spin }: { icon: typeof CloudOff; title: string; copy: string; spin?: boolean }) {
  return <div className="em-empty"><Icon aria-hidden="true" className={spin ? "animate-spin" : undefined} /><strong>{title}</strong><span>{copy}</span></div>;
}

/**
 * Independent expenditures for and against each candidate in the selected race.
 * Support and opposition are separate bars on one scale and are never netted.
 */
export function OutsideSpendingCard({ contest }: { contest: MonitorContest | undefined }) {
  const office = contest?.office === "US_SENATE" ? "S" : contest?.office === "US_HOUSE" ? "H" : null;
  const enabled = Boolean(contest && office && !contest.isFictional);
  const race = useQuery({
    queryKey: ["election-monitor", "outside-spending", contest?.stateCode, office, contest?.district, MONITOR_CYCLE],
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: () => getRaceOutsideSpending({ state: contest!.stateCode, office: office!, district: contest!.district, cycle: MONITOR_CYCLE }),
  });

  const data = race.data;
  // Prefer the names on the ballot list; FEC Schedule E names are "LAST, FIRST".
  const nameFor = (candidateId: string | null, fallback: string | null) =>
    contest?.candidates.find((candidate) => candidate.fecId && candidate.fecId === candidateId)?.name
    ?? (fallback ? displayName(fallback) : "Candidate not named in filing");
  const max = Math.max(1, ...(data?.candidates ?? []).flatMap((item) => [item.support, item.oppose]));

  let body;
  if (!contest) body = <Empty icon={BadgeDollarSign} title="No contest selected" copy="Select a contest to see outside spending for and against its candidates." />;
  else if (!enabled) body = <Empty icon={BadgeDollarSign} title="No FEC records" copy="Fictional contests have no campaign-finance records." />;
  else if (race.isLoading) body = <Empty icon={Loader2} spin title="Loading outside spending" copy="Fetching independent expenditures for this race." />;
  else if (race.isError || !data) body = <Empty icon={CloudOff} title="Outside spending unavailable" copy="The outside spending API could not be reached." />;
  else if (data.coverage.status === "not_synced") body = <Empty icon={Database} title="Not loaded yet" copy="FEC independent-expenditure data has not been synced into VoteInformed yet." />;
  else if (data.candidates.length === 0) {
    body = <Empty icon={BadgeDollarSign} title="No outside spending reported" copy={`No independent expenditures for or against candidates in this race have been reported to the FEC for the ${MONITOR_CYCLE} cycle.`} />;
  } else {
    body = (
      <>
        <div className="em-spend-legend" aria-hidden="true">
          <span><i data-side="for" />For</span>
          <span><i data-side="against" />Against</span>
        </div>
        <div className="em-spend-list">
          {data.candidates.map((item) => {
            const name = nameFor(item.candidateId, item.candidateName);
            return (
              <div className="em-spend-candidate" key={item.candidateId ?? "unnamed"}>
                <div className="em-spend-name">
                  <strong>{name}</strong>
                  {item.candidateId && (
                    <a className="em-link" href={fecIndependentExpendituresUrl({ cycle: MONITOR_CYCLE, candidateId: item.candidateId })} target="_blank" rel="noopener noreferrer" aria-label={`FEC filings for outside spending on ${name}`}>FEC ↗</a>
                  )}
                </div>
                {(["support", "oppose"] as const).map((side) => (
                  <div className="em-spend-row" key={side}>
                    <span>{side === "support" ? "For" : "Against"}</span>
                    <div className="em-spend-bar" aria-hidden="true">{item[side] > 0 && <span data-side={side === "support" ? "for" : "against"} style={{ width: `${(item[side] / max) * 100}%` }} />}</div>
                    <strong>{money(item[side])}</strong>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
        {data.topSpenders.length > 0 && (
          <table className="em-spend-spenders">
            <caption>Top outside spenders in this race</caption>
            <thead><tr><th scope="col">Group</th><th scope="col">For</th><th scope="col">Against</th></tr></thead>
            <tbody>
              {data.topSpenders.map((spender) => (
                <tr key={spender.committeeId}>
                  <th scope="row" title={spender.committeeName}>{committeeName(spender.committeeName)}</th>
                  <td>{spender.support ? money(spender.support) : "—"}</td>
                  <td>{spender.oppose ? money(spender.oppose) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </>
    );
  }

  const coverage = data?.coverage;
  return (
    <section className="em-card" aria-labelledby="em-outside-heading" aria-busy={race.isFetching}>
      <h3 id="em-outside-heading">Outside spending</h3>
      <p>Independent expenditures: money groups such as super PACs and parties spend for or against a candidate without coordinating with the campaign. Support and opposition are never netted.</p>
      {body}
      {coverage && coverage.status !== "not_synced" && (
        <div className="em-note">
          FEC Schedule E, {MONITOR_CYCLE} cycle
          {coverage.latestExpenditureDate ? `, spending through ${formatShortDate(coverage.latestExpenditureDate)}` : ""}
          {coverage.lastSyncedAt ? `. Synced ${formatShortDate(coverage.lastSyncedAt)}` : ""}.
          {" "}Includes 24/48-hour notices not yet on a regular report.
          {coverage.status === "backfilling" ? " Older filings are still loading, so totals may be low." : ""}
        </div>
      )}
    </section>
  );
}
