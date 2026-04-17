import { useQueries } from "@tanstack/react-query";
import { History, Loader2 } from "lucide-react";
import { getElections } from "@/lib/api";
import type { Election } from "@/types/candidate";

interface RaceContextProps {
  state: string;
  officeType: string;
  district?: string | null;
  currentCycle: number;
}

function priorCycles(currentCycle: number, count = 2): number[] {
  const cycles: number[] = [];
  for (let i = 1; i <= count; i++) {
    cycles.push(currentCycle - i * 2);
  }
  return cycles;
}

function formatWinnerLine(election: Election): string | null {
  const winnerCE = election.candidateElections?.find((ce) => ce.result === "WON");
  if (!winnerCE?.candidate) return null;
  const pct =
    winnerCE.votePercentage != null
      ? ` ${winnerCE.votePercentage.toFixed(1)}%`
      : "";
  const partyLetter = winnerCE.candidate.party
    ? ` (${winnerCE.candidate.party.charAt(0).toUpperCase()})`
    : "";
  return `${winnerCE.candidate.name}${partyLetter}${pct}`;
}

export function RaceContext({
  state,
  officeType,
  district,
  currentCycle,
}: RaceContextProps) {
  const cycles = priorCycles(currentCycle);

  const queries = useQueries({
    queries: cycles.map((cycle) => ({
      queryKey: ["prior-race", state, officeType, district ?? "", cycle],
      queryFn: () =>
        getElections({
          state,
          officeType,
          district: district ?? undefined,
          electionType: "GENERAL",
          cycle,
        }),
      staleTime: 10 * 60 * 1000,
      retry: 1,
    })),
  });

  const isLoading = queries.some((q) => q.isLoading);

  const priorRaces: { cycle: number; election: Election }[] = [];
  queries.forEach((q, i) => {
    const election = q.data?.data?.[0];
    if (election) priorRaces.push({ cycle: cycles[i], election });
  });

  return (
    <div className="mb-8">
      <h2 className="font-heading text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        Race Context
      </h2>
      <div className="rounded-lg border border-border bg-card p-6">
        {isLoading && priorRaces.length === 0 ? (
          <div className="flex items-center gap-2 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading prior race results…
          </div>
        ) : priorRaces.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No prior race data available for this seat.
          </p>
        ) : (
          <ul className="space-y-3">
            {priorRaces.map(({ cycle, election }) => {
              const winner = formatWinnerLine(election);
              return (
                <li
                  key={election.id}
                  className="flex flex-col sm:flex-row sm:items-baseline sm:gap-3"
                >
                  <span className="font-medium text-foreground w-28 shrink-0">
                    {cycle} General
                  </span>
                  <span className="text-muted-foreground text-sm">
                    {winner ? `Winner: ${winner}` : "Result unavailable"}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default RaceContext;
