import { useState } from "react";
import { BadgeDollarSign, FlaskConical } from "lucide-react";
import type {
  CandidateContract,
  ContestResultViewModel,
  ContestViewModel,
  FinanceSummaryViewModel,
} from "./types";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const number = new Intl.NumberFormat("en-US");

export function RaceDetailPanel({ contest, result, candidates, finance, stateName, district }: {
  contest: ContestViewModel;
  result?: ContestResultViewModel;
  candidates: CandidateContract[];
  finance: FinanceSummaryViewModel[];
  stateName: string;
  district: string;
}) {
  const orderedCandidates = [...candidates].sort(
    (a, b) => (a.ballotOrder ?? Number.MAX_SAFE_INTEGER) - (b.ballotOrder ?? Number.MAX_SAFE_INTEGER),
  );
  const [selectedCandidateId, setSelectedCandidateId] = useState(orderedCandidates[0]?.id ?? "");

  if (!result) return <section className="ed-panel"><p className="ed-empty">No mock result snapshot is available for this contest.</p></section>;

  const selectedCandidate = orderedCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? orderedCandidates[0];
  const selectedFinance = finance.find((item) => item.candidateId === selectedCandidate?.id);
  const reported = result.reportingProgress.precincts.reported;
  const total = result.reportingProgress.precincts.total;
  const reportingPercent = result.reportingProgress.precincts.percentage;
  const title = contest.officeTitle;

  return (
    <section className="ed-panel ed-detail" aria-labelledby="race-detail-heading">
      <div className="ed-detail-title">
        <div><span className="ed-eyebrow">Selected fictional contest</span><h2 id="race-detail-heading">{title}</h2></div>
        <span className="ed-badge ed-badge-warning">Mock {result.certificationState.toLowerCase()}</span>
      </div>
      <div className="ed-reporting-summary">
        <span>{reported ?? "Unknown"} of {total ?? "unknown"} mock precincts reporting</span><strong>{reportingPercent === null ? "Unknown" : `${Math.round(reportingPercent)}%`}</strong>
      </div>
      <div className="ed-progress" role="progressbar" aria-label="Mock reporting units received" aria-valuemin={0} aria-valuemax={total ?? undefined} aria-valuenow={reported ?? undefined} aria-valuetext={reportingPercent === null ? "Reporting progress unavailable" : `${Math.round(reportingPercent)} percent`}>
        <span style={{ width: `${reportingPercent ?? 0}%` }} />
      </div>

      <div className="ed-results">
        {orderedCandidates.map((candidate) => {
          const candidateResult = result.candidateResults.find((item) => item.candidateId === candidate.id);
          return (
            <button key={candidate.id} type="button" aria-pressed={selectedCandidate?.id === candidate.id} onClick={() => setSelectedCandidateId(candidate.id)}>
              <span className="ed-avatar" aria-hidden="true">{candidate.displayName.split(" ").map((part) => part[0]).join("")}</span>
              <span className="ed-candidate-name"><strong>{candidate.displayName}</strong><small>{candidate.party?.name ?? "No affiliation listed"} · fictional · ballot order {candidate.ballotOrder ?? "not supplied"}</small></span>
              <span className="ed-candidate-total"><strong>{candidateResult?.percentage.toFixed(1) ?? "0.0"}%</strong><small>{number.format(candidateResult?.votes ?? 0)} votes</small></span>
            </button>
          );
        })}
      </div>

      <div className="ed-unit-list" aria-label="Mock reporting units">
        {result.reportingUnits.map((unit) => (
          <div key={unit.reportingUnit.id}><span>{unit.reportingUnit.name}</span><strong>{unit.reported ?? "Unknown"}/{unit.total ?? "unknown"} units</strong></div>
        ))}
      </div>

      <section className="ed-finance" aria-labelledby="candidate-finance-heading">
        <div className="ed-panel-heading"><div><span className="ed-eyebrow">Candidate details</span><h3 id="candidate-finance-heading"><BadgeDollarSign aria-hidden="true" /> Fictional finance summary</h3></div><span className="ed-badge ed-badge-mock"><FlaskConical aria-hidden="true" /> Mock</span></div>
        {selectedCandidate && selectedFinance ? (
          <>
            <p className="ed-finance-name">{selectedCandidate.displayName} · {selectedFinance.reportLabel}</p>
            <dl className="ed-finance-grid">
              <div><dt>Receipts</dt><dd>{currency.format(selectedFinance.receipts)}</dd></div>
              <div><dt>Disbursements</dt><dd>{currency.format(selectedFinance.disbursements)}</dd></div>
              <div><dt>Cash on hand</dt><dd>{currency.format(selectedFinance.cashOnHand)}</dd></div>
              <div><dt>Debts</dt><dd>{currency.format(selectedFinance.debts)}</dd></div>
              <div><dt>Outside spending supporting</dt><dd>{currency.format(selectedFinance.supportingOutsideSpending)}</dd></div>
              <div><dt>Outside spending opposing</dt><dd>{currency.format(selectedFinance.opposingOutsideSpending)}</dd></div>
            </dl>
            <p className="ed-source-note">Fictional values covering {selectedFinance.coverageStart} through {selectedFinance.coverageEnd}. Supporting and opposing amounts are shown separately and are not netted.</p>
          </>
        ) : <p className="ed-empty">No fictional finance fixture is available for this candidate.</p>}
      </section>
    </section>
  );
}
