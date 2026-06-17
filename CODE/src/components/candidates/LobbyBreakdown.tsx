/**
 * LobbyBreakdown — shows how much money a candidate has accepted from
 * curated industry / lobby buckets (AI, Oil & Gas, Pro-Israel, Pharma,
 * Defense, Crypto, Labor) based on FEC Schedule A filings.
 */

import { useEffect, useState } from "react";
import { Loader2, AlertCircle, Building2, ChevronDown, ChevronUp, Info } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { getCandidateLobbyBreakdown } from "@/lib/api";
import type { LobbyBreakdownResponse, LobbyBucket } from "@/types/candidate";

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(2)}M`;
  if (amount >= 1_000) return `$${(amount / 1_000).toFixed(1)}K`;
  return `$${amount.toFixed(0)}`;
}

interface LobbyRowProps {
  bucket: LobbyBucket;
  maxAmount: number;
}

function LobbyRow({ bucket, maxAmount }: LobbyRowProps) {
  const [expanded, setExpanded] = useState(false);
  const hasMoney = bucket.totalAmount > 0;
  const barPct = maxAmount > 0 ? (bucket.totalAmount / maxAmount) * 100 : 0;

  return (
    <div
      className={`rounded-lg border bg-card transition-colors ${
        hasMoney ? "border-border" : "border-border/50 opacity-60"
      }`}
    >
      <button
        type="button"
        onClick={() => hasMoney && setExpanded((v) => !v)}
        disabled={!hasMoney}
        className="w-full text-left p-4 flex items-start gap-4"
      >
        <span
          className="mt-1 h-3 w-3 rounded-full shrink-0"
          style={{ backgroundColor: bucket.color }}
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h4 className="font-semibold text-foreground truncate">{bucket.name}</h4>
            <div className="text-right shrink-0">
              <p className="font-semibold text-foreground">{formatCurrency(bucket.totalAmount)}</p>
              <p className="text-xs text-muted-foreground">
                {bucket.contributionCount} contribution{bucket.contributionCount === 1 ? "" : "s"}
                {bucket.percentageOfReceipts > 0 && (
                  <> · {bucket.percentageOfReceipts}% of total</>
                )}
              </p>
            </div>
          </div>
          <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{bucket.description}</p>
          <Progress value={barPct} className="h-2" />
        </div>
        {hasMoney && (
          <span className="mt-1 shrink-0 text-muted-foreground">
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        )}
      </button>

      {expanded && bucket.topContributors.length > 0 && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Top contributors in this lobby
          </p>
          {bucket.topContributors.map((c, idx) => (
            <div
              key={`${c.name}-${idx}`}
              className="flex items-start justify-between gap-3 text-sm"
            >
              <div className="min-w-0">
                <p className="font-medium text-foreground truncate">{c.name}</p>
                {c.employer && (
                  <p className="text-xs text-muted-foreground truncate">{c.employer}</p>
                )}
              </div>
              <div className="text-right shrink-0">
                <p className="font-medium text-foreground">{formatCurrency(c.amount)}</p>
                <p className="text-xs text-muted-foreground">
                  {c.count} gift{c.count === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface LobbyBreakdownProps {
  candidateId: string;
  cycle?: number;
}

export function LobbyBreakdown({ candidateId, cycle = 2026 }: LobbyBreakdownProps) {
  const [data, setData] = useState<LobbyBreakdownResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    getCandidateLobbyBreakdown(candidateId, cycle)
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [candidateId, cycle]);

  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
          <p>Aggregating lobby contributions…</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6">
        <div className="flex items-start gap-3">
          <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="font-medium text-foreground">Couldn't load lobby breakdown</p>
            <p className="text-sm text-muted-foreground">{error}</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const maxAmount = data.lobbies.reduce((m, l) => Math.max(m, l.totalAmount), 0);
  const anyMoney = maxAmount > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-6">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <h2 className="font-heading text-xl font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            Industry & Lobby Breakdown
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            How much this candidate has received from major industry lobbies, classified from
            itemized FEC filings for the {data.cycle} cycle.
          </p>
        </div>
        {anyMoney && (
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">Classified</p>
            <p className="font-semibold text-foreground">
              {formatCurrency(data.totalLobbyAmount)}
            </p>
            <p className="text-xs text-muted-foreground">
              {data.classifiedPercentage}% of receipts
            </p>
          </div>
        )}
      </div>

      {anyMoney ? (
        <div className="space-y-3">
          {data.lobbies.map((bucket) => (
            <LobbyRow key={bucket.id} bucket={bucket} maxAmount={maxAmount} />
          ))}
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No contributions matching tracked lobbies were found for this candidate yet.
        </div>
      )}

      <div className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
        <div className="space-y-1">
          {data.notes.map((note, i) => (
            <p key={i}>{note}</p>
          ))}
        </div>
      </div>
    </div>
  );
}
