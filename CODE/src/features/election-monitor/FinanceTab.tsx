import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { BadgeDollarSign, CloudOff, Loader2 } from "lucide-react";
import { getCandidateDetailedFinances } from "@/lib/api";
import { MONITOR_CYCLE } from "./realData";
import type { MonitorContest } from "./types";

const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });
const money = (value: number) => compact.format(value);

function Empty({ icon: Icon, title, copy, spin }: { icon: typeof CloudOff; title: string; copy: string; spin?: boolean }) {
  return <div className="em-empty"><Icon aria-hidden="true" className={spin ? "animate-spin" : undefined} /><strong>{title}</strong><span>{copy}</span></div>;
}

export function FinanceTab({ contest }: { contest: MonitorContest | undefined }) {
  const candidates = contest?.candidates.filter((candidate) => candidate.profileId) ?? [];
  const [chosen, setChosen] = useState<string | null>(null);
  const selected = candidates.find((candidate) => candidate.id === chosen) ?? candidates[0];

  const finance = useQuery({
    queryKey: ["election-monitor", "finance", selected?.profileId, MONITOR_CYCLE],
    enabled: Boolean(selected?.profileId),
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: () => getCandidateDetailedFinances(selected!.profileId!, MONITOR_CYCLE),
  });

  const summary = finance.data?.summary;
  const hasFilings = Boolean(summary && (summary.totalReceipts > 0 || summary.totalDisbursements > 0 || summary.cashOnHand > 0));
  const breakdownAvailable = finance.data?.breakdownAvailable !== false;
  const mix = summary && breakdownAvailable
    ? [
        { label: "Individuals", value: summary.individualContributions },
        { label: "PACs", value: summary.pacContributions },
        { label: "Party", value: summary.partyContributions },
        { label: "Self-funded", value: summary.selfFunded },
      ]
    : [];
  const mixMax = Math.max(1, ...mix.map((item) => item.value));

  let body;
  if (!contest) body = <Empty icon={BadgeDollarSign} title="No contest selected" copy="Select a contest to compare its candidates' FEC filings." />;
  else if (candidates.length === 0) body = <Empty icon={BadgeDollarSign} title="No FEC candidates" copy={contest.isFictional ? "Fictional contests have no campaign-finance records." : "No candidates in this contest are linked to FEC records yet."} />;
  else if (finance.isLoading) body = <Empty icon={Loader2} spin title="Loading filings" copy="Fetching FEC summaries for this candidate." />;
  else if (finance.isError) body = <Empty icon={CloudOff} title="Finance data unavailable" copy="The finance API could not be reached." />;
  else if (!hasFilings || !summary) body = <Empty icon={BadgeDollarSign} title="No filings on file" copy={`No ${MONITOR_CYCLE} cycle FEC totals are on file for this candidate yet.`} />;
  else {
    body = (
      <>
        <dl className="em-metrics">
          <div className="em-metric"><dt>Total receipts</dt><dd>{money(summary.totalReceipts)}</dd></div>
          <div className="em-metric"><dt>Cash on hand</dt><dd>{money(summary.cashOnHand)}</dd></div>
          <div className="em-metric"><dt>Disbursements</dt><dd>{money(summary.totalDisbursements)}</dd></div>
          <div className="em-metric"><dt>Debts</dt><dd>{money(summary.debtOwed)}</dd></div>
        </dl>
        {mix.length > 0 && (
          <div className="em-finance-chart" aria-label="Receipts by source">
            {mix.map((item) => (
              <div className="em-finance-row" key={item.label}>
                <span>{item.label}</span>
                <div className="em-bar" aria-hidden="true"><span style={{ width: `${(item.value / mixMax) * 100}%` }} /></div>
                <strong>{money(item.value)}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="em-note">
          FEC filings, {MONITOR_CYCLE} cycle{summary.lastUpdated ? `, updated ${new Date(summary.lastUpdated).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}.
          {breakdownAvailable ? "" : " Breakdown by source is still syncing."}
          {finance.data?.itemizedCoverage.status === "partial" ? " Itemized detail is still syncing for some committees." : ""}
        </div>
      </>
    );
  }

  return (
    <>
      <section className="em-card" aria-labelledby="em-finance-heading">
        <h3 id="em-finance-heading">Candidate finance</h3>
        <p>Campaign committee totals reported to the Federal Election Commission.</p>
        {candidates.length > 1 && (
          <div className="em-finance-candidates" role="group" aria-label="Choose a candidate">
            {candidates.map((candidate) => (
              <button key={candidate.id} type="button" aria-pressed={candidate.id === selected?.id} onClick={() => setChosen(candidate.id)}>
                {candidate.name}
              </button>
            ))}
          </div>
        )}
        {body}
        {selected?.profileId && <Link className="em-link mt-3 inline-block" to={`/candidates/${selected.profileId}`}>Full finance profile, donors and industry breakdown →</Link>}
      </section>

      <section className="em-card" aria-labelledby="em-outside-heading">
        <h3 id="em-outside-heading">Outside spending</h3>
        <p>Independent expenditures supporting and opposing candidates are reported separately and never netted.</p>
        <Empty icon={BadgeDollarSign} title="Not yet available" copy="Independent-expenditure data is not loaded into VoteInformed yet." />
      </section>
    </>
  );
}
