import { useQueries } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { getCandidateFinances } from "@/lib/api";
import type { Candidate, CandidateFinanceResponse } from "@/types/candidate";

interface CandidateComparisonProps {
  candidates: Candidate[];
  incumbentId?: string;
  cycle?: number;
}

function formatCurrency(amount: number | null | undefined): string {
  if (amount == null) return "—";
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(0)}K`;
  return `$${amount.toFixed(0)}`;
}

function partyShort(party?: string): string {
  if (!party) return "I";
  const p = party.toUpperCase();
  if (p.includes("DEM")) return "D";
  if (p.includes("REP")) return "R";
  return party.charAt(0).toUpperCase();
}

function partyBadgeClass(party?: string): string {
  if (!party) return "bg-muted text-muted-foreground";
  const p = party.toUpperCase();
  if (p.includes("DEM")) return "bg-info/10 text-info border-info/20";
  if (p.includes("REP")) return "bg-destructive/10 text-destructive border-destructive/20";
  return "bg-muted text-muted-foreground";
}

function sumReceipts(finance: CandidateFinanceResponse | undefined): number | null {
  if (!finance) return null;
  const total = finance.finances.reduce(
    (acc, f) => acc + (f.summary?.totalReceipts ?? 0),
    0,
  );
  return total > 0 ? total : null;
}

function sumCashOnHand(finance: CandidateFinanceResponse | undefined): number | null {
  if (!finance) return null;
  const total = finance.finances.reduce(
    (acc, f) => acc + (f.summary?.cashOnHand ?? 0),
    0,
  );
  return total > 0 ? total : null;
}

export function CandidateComparison({
  candidates,
  incumbentId,
  cycle,
}: CandidateComparisonProps) {
  const financeQueries = useQueries({
    queries: candidates.map((c) => ({
      queryKey: ["candidate-finances", c.id, cycle],
      queryFn: () => getCandidateFinances(c.id, cycle),
      staleTime: 5 * 60 * 1000,
      retry: 1,
    })),
  });

  if (candidates.length < 2) return null;

  return (
    <div className="mb-8">
      <h2 className="font-heading text-xl font-semibold text-foreground mb-6">
        Compare Candidates
      </h2>
      <div className="overflow-x-auto rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/40">
            <tr>
              <th className="sticky left-0 z-10 bg-muted/40 text-left px-4 py-3 font-medium text-muted-foreground w-40">
                Attribute
              </th>
              {candidates.map((c) => (
                <th
                  key={c.id}
                  className="text-left px-4 py-3 font-medium text-foreground min-w-[180px]"
                >
                  <Link
                    to={`/candidates/${c.id}`}
                    className="hover:text-primary transition-colors"
                  >
                    {c.name}
                  </Link>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            <tr>
              <td className="sticky left-0 bg-card px-4 py-3 text-muted-foreground">Party</td>
              {candidates.map((c) => (
                <td key={c.id} className="px-4 py-3">
                  <Badge variant="outline" className={partyBadgeClass(c.party)}>
                    {partyShort(c.party)}
                  </Badge>
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 bg-card px-4 py-3 text-muted-foreground">
                Incumbent
              </td>
              {candidates.map((c) => (
                <td key={c.id} className="px-4 py-3 text-foreground">
                  {c.id === incumbentId ? "Yes" : "No"}
                </td>
              ))}
            </tr>
            <tr>
              <td className="sticky left-0 bg-card px-4 py-3 text-muted-foreground">
                Ideology score
              </td>
              {candidates.map((c) => {
                const score = c.ideologyScores?.[0]?.ideologyScore;
                return (
                  <td key={c.id} className="px-4 py-3 text-foreground">
                    {score != null ? `${score}/100` : "—"}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="sticky left-0 bg-card px-4 py-3 text-muted-foreground">
                Total receipts
              </td>
              {candidates.map((c, i) => {
                const q = financeQueries[i];
                return (
                  <td key={c.id} className="px-4 py-3 text-foreground">
                    {q.isLoading
                      ? "…"
                      : q.isError
                        ? "—"
                        : formatCurrency(sumReceipts(q.data))}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="sticky left-0 bg-card px-4 py-3 text-muted-foreground">
                Cash on hand
              </td>
              {candidates.map((c, i) => {
                const q = financeQueries[i];
                return (
                  <td key={c.id} className="px-4 py-3 text-foreground">
                    {q.isLoading
                      ? "…"
                      : q.isError
                        ? "—"
                        : formatCurrency(sumCashOnHand(q.data))}
                  </td>
                );
              })}
            </tr>
            <tr>
              <td className="sticky left-0 bg-card px-4 py-3 text-muted-foreground">
                Current office
              </td>
              {candidates.map((c) => (
                <td key={c.id} className="px-4 py-3 text-foreground">
                  {c.currentOfficeHeld || "—"}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default CandidateComparison;
