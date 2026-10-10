import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Database, ExternalLink, Loader2, Megaphone, Users } from "lucide-react";
import { fecIndependentExpendituresUrl, getCandidateOutsideSpending, type SpendingSplit } from "@/lib/api";
import { committeeName, formatShortDate } from "@/features/election-monitor/constants";

const currency = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

function State({ icon: Icon, title, copy, spin }: { icon: typeof Database; title: string; copy: string; spin?: boolean }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <Icon className={`h-12 w-12 text-muted-foreground mx-auto mb-4${spin ? " animate-spin" : ""}`} />
      <h3 className="font-heading font-semibold text-foreground mb-2">{title}</h3>
      <p className="text-muted-foreground">{copy}</p>
    </div>
  );
}

/** "For" and "Against" as two labeled bars on a shared scale; never netted. */
function SplitBars({ value, max }: { value: SpendingSplit; max: number }) {
  return (
    <div className="space-y-1.5">
      {(["support", "oppose"] as const).map((side) => (
        <div key={side} className="grid grid-cols-[64px_1fr_72px] items-center gap-3 text-sm">
          <span className="text-muted-foreground">{side === "support" ? "For" : "Against"}</span>
          <div className="h-2 rounded-full bg-muted" aria-hidden="true">
            {value[side] > 0 && (
              <div
                className={`h-full min-w-[2px] rounded-full ${side === "support" ? "bg-[hsl(var(--spend-for))]" : "bg-[hsl(var(--spend-against))]"}`}
                style={{ width: `${(value[side] / max) * 100}%` }}
              />
            )}
          </div>
          <span className="text-right font-medium tabular-nums text-foreground">{value[side] ? compact.format(value[side]) : "—"}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Independent expenditures (FEC Schedule E) for and against one candidate:
 * totals, top outside spenders, how the money was spent, and recent filings.
 */
export function OutsideSpendingPanel({ candidateId, fecCandidateId, cycle = 2026 }: { candidateId: string; fecCandidateId: string; cycle?: number }) {
  const query = useQuery({
    queryKey: ["candidate", candidateId, "outside-spending", cycle],
    staleTime: 10 * 60_000,
    retry: 1,
    queryFn: () => getCandidateOutsideSpending(candidateId, cycle),
  });
  const data = query.data;

  if (query.isLoading) return <State icon={Loader2} spin title="Loading outside spending" copy="Fetching independent expenditures reported to the FEC." />;
  if (query.isError || !data) return <State icon={AlertCircle} title="Outside spending unavailable" copy="The outside spending API could not be reached." />;
  if (data.coverage.status === "not_synced") {
    return <State icon={Database} title="Not loaded yet" copy="FEC independent-expenditure data has not been synced into VoteInformed yet." />;
  }
  if (data.count === 0) {
    return <State icon={Megaphone} title="No outside spending reported" copy={`No independent expenditures for or against this candidate have been reported to the FEC for the ${cycle} cycle.`} />;
  }

  const spenderMax = Math.max(1, ...data.bySpender.flatMap((item) => [item.support, item.oppose]));
  const typeMax = Math.max(1, ...data.byType.flatMap((item) => [item.support, item.oppose]));
  const fecUrl = fecIndependentExpendituresUrl({ cycle, candidateId: fecCandidateId });

  return (
    <>
      <p className="text-muted-foreground">
        Independent expenditures are money that outside groups, such as super PACs and party committees, spend for or against a candidate without
        coordinating with the campaign. Spending for and against is shown separately and never netted.
      </p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {[
          { label: "Spent for", value: data.support, swatch: "bg-[hsl(var(--spend-for))]" },
          { label: "Spent against", value: data.oppose, swatch: "bg-[hsl(var(--spend-against))]" },
          { label: "Total outside spending", value: data.total },
          { label: "From 24/48-hour notices", value: data.fromNotices },
        ].map((tile) => (
          <div key={tile.label} className="rounded-lg border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground mb-1 flex items-center gap-2">
              {tile.swatch && <span className={`h-2.5 w-2.5 rounded-full ${tile.swatch}`} aria-hidden="true" />}
              {tile.label}
            </p>
            <p className="font-heading text-2xl font-bold text-foreground tabular-nums">{currency.format(tile.value)}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-heading text-xl font-semibold text-foreground mb-6 flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Top Outside Spenders
        </h2>
        <div className="space-y-5">
          {data.bySpender.map((spender) => (
            <div key={spender.committeeId}>
              <p className="font-medium text-foreground mb-2" title={spender.committeeName}>{committeeName(spender.committeeName)}</p>
              <SplitBars value={spender} max={spenderMax} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-heading text-xl font-semibold text-foreground mb-2 flex items-center gap-2">
          <Megaphone className="h-5 w-5 text-primary" />
          How the Money Was Spent
        </h2>
        <p className="text-sm text-muted-foreground mb-6">Grouped from each filing's description, such as "TV ad" or "mailer". Descriptions that name no medium are counted as Other.</p>
        <div className="space-y-5">
          {data.byType.map((item) => (
            <div key={item.type}>
              <p className="font-medium text-foreground mb-2">{item.type}</p>
              <SplitBars value={item} max={typeMax} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card p-6">
        <h2 className="font-heading text-xl font-semibold text-foreground mb-4">Latest Expenditures</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-muted-foreground">
                <th scope="col" className="py-2 pr-3 font-medium">Date</th>
                <th scope="col" className="py-2 pr-3 font-medium">Group</th>
                <th scope="col" className="py-2 pr-3 font-medium">For or against</th>
                <th scope="col" className="py-2 pr-3 font-medium">Type</th>
                <th scope="col" className="py-2 pr-3 text-right font-medium">Amount</th>
                <th scope="col" className="py-2 font-medium"><span className="sr-only">Filing</span></th>
              </tr>
            </thead>
            <tbody>
              {data.recent.map((item, index) => (
                <tr key={`${item.committeeId}-${item.date}-${index}`} className="border-b border-border last:border-b-0">
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{item.date ? formatShortDate(item.date) : "—"}</td>
                  <td className="py-2 pr-3 text-foreground" title={item.description ?? undefined}>{committeeName(item.committeeName)}</td>
                  <td className="py-2 pr-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${item.supportOppose === "S" ? "bg-[hsl(var(--spend-for))]" : "bg-[hsl(var(--spend-against))]"}`} aria-hidden="true" />
                      {item.supportOppose === "S" ? "For" : "Against"}
                    </span>
                    {item.isNotice && <span className="ml-2 text-xs text-muted-foreground">24/48-hr notice</span>}
                  </td>
                  <td className="py-2 pr-3 whitespace-nowrap text-muted-foreground">{item.type}</td>
                  <td className="py-2 pr-3 text-right font-medium tabular-nums text-foreground">{currency.format(item.amount)}</td>
                  <td className="py-2">
                    {item.pdfUrl && (
                      <a href={item.pdfUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline" aria-label={`Filing for ${currency.format(item.amount)} by ${committeeName(item.committeeName)}`}>
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        Source: FEC Schedule E independent expenditures, {cycle} cycle
        {data.coverage.latestExpenditureDate ? `, spending through ${formatShortDate(data.coverage.latestExpenditureDate)}` : ""}
        {data.coverage.lastSyncedAt ? `. Synced ${formatShortDate(data.coverage.lastSyncedAt)}` : ""}. 24- and 48-hour notices are counted only until the
        same spending appears on the group's regular report, so nothing is counted twice.
        {data.coverage.status === "backfilling" ? " Older filings are still loading, so totals may be low." : ""}{" "}
        <a href={fecUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">Check the filings on FEC.gov</a>
      </p>
    </>
  );
}
