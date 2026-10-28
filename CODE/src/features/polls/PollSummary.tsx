import { averageHeadline, partyShort } from "./pollFormat";
import { useRacePolls } from "./polls";
import "./polls.css";

/**
 * One line for a race card: the polling average's leader and margin, with a
 * button to the full polls view. Renders nothing while loading, on errors, or
 * with no average, so the card never shows a placeholder number.
 */
export function PollSummary({ race, candidateNames, onShowPolls }: { race: string | null; candidateNames?: Record<string, string>; onShowPolls?: () => void }) {
  const { data } = useRacePolls(race);
  const average = data?.average;
  if (!average) return null;
  const nameOf = (candidate: { key: string; name: string; candidateFecId: string | null }) =>
    (candidate.candidateFecId && candidateNames?.[candidate.candidateFecId]) || candidate.name;
  const headline = averageHeadline(average, nameOf);

  const shares = average.candidates.slice(0, 2)
    .map((candidate) => `${nameOf(candidate)}${partyShort(candidate.party) ? ` (${partyShort(candidate.party)})` : ""} ${candidate.pct.toFixed(1)}%`)
    .join(", ");
  const detail = headline
    ? `average of ${average.pollsterCount} pollsters`
    : average.status === "too_few" ? "One pollster recently; too few to average"
      : average.status === "stale" ? `No polls in the last ${average.windowDays} days`
        : "No public polling";

  return (
    <div className="polls-summary" role="group" aria-label={headline ? `Polling average: ${headline}. ${shares}. ${detail}.` : `Polls: ${detail}`}>
      <span className="polls-eyebrow" aria-hidden="true">Polls</span>
      <span className="polls-summary-text" aria-hidden="true">{headline && <strong>{headline}</strong>}{headline ? ` · ${detail}` : detail}</span>
      {onShowPolls && (data.polls.length > 0 || headline) && (
        <button type="button" className="polls-summary-link" onClick={onShowPolls}>See polls</button>
      )}
    </div>
  );
}
