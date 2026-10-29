import type { UseQueryResult } from "@tanstack/react-query";
import type { RaceOutsideSpending } from "@/lib/api";
import { committeeName, formatShortDate } from "@/features/election-monitor/constants";
import { Panel, StatusLine } from "../panels/Panel";
import { money, type pickCandidates } from "./dossier";

type Picked = ReturnType<typeof pickCandidates>;

/**
 * Candidate money and outside money, Democrat to the left and Republican to the right, on one scale. Outside
 * money for and against each candidate are separate rows and are never netted.
 */
export function MoneyPanel({ id, picked, spending }: { id: string; picked: Picked; spending: UseQueryResult<RaceOutsideSpending> }) {
  const { d, r } = picked;
  const data = spending.data;
  const synced = data && data.coverage.status !== "not_synced";
  const outside = (fecId: string | undefined) => (synced ? data.candidates.find((item) => item.candidateId && item.candidateId === fecId) ?? { support: 0, oppose: 0 } : null);
  const dOut = outside(d?.fecId);
  const rOut = outside(r?.fecId);
  const rows: Array<{ label: string; d: number | null; r: number | null; style: "solid" | "soft" | "hatch" }> = [
    { label: "Receipts", d: d?.receipts ?? null, r: r?.receipts ?? null, style: "solid" },
    { label: "Cash on hand", d: d?.cashOnHand ?? null, r: r?.cashOnHand ?? null, style: "solid" },
    { label: "Outside for", d: dOut?.support ?? null, r: rOut?.support ?? null, style: "soft" },
    { label: "Outside against", d: dOut?.oppose ?? null, r: rOut?.oppose ?? null, style: "hatch" },
  ];
  const max = Math.max(1, ...rows.flatMap((row) => [row.d ?? 0, row.r ?? 0]));
  const width = (value: number | null) => `${((value ?? 0) / max) * 100}%`;
  const through = [d?.fundingThrough, r?.fundingThrough].filter((value): value is string => Boolean(value)).sort().pop();
  const foot = [
    through ? `FEC through ${formatShortDate(through)}` : "No FEC report on file",
    synced && data.coverage.lastSyncedAt ? `Schedule E synced ${formatShortDate(data.coverage.lastSyncedAt)}` : null,
    data?.coverage.status === "backfilling" ? "older filings still loading" : null,
    "Support and opposition never netted",
  ].filter(Boolean).join(" · ");

  return (
    <section id={id} className="wr-panel wr-money" aria-labelledby={`${id}-title`} data-flush>
      <div className="wr-money-main">
        <div className="wr-panel-head">
          <h2 id={`${id}-title`} className="wr-panel-title">Money · candidate + outside</h2>
          <span className="wr-panel-meta">2026 cycle</span>
        </div>
        {!d && !r ? <StatusLine>No candidates on file</StatusLine> : (
          <>
            <div className="wr-money-names"><span className="wr-dem">◀ {d?.name ?? "No Democrat on file"}</span><span className="wr-rep">{r?.name ?? "No Republican on file"} ▶</span></div>
            <div className="wr-butterfly">
              {rows.map((row) => (
                <div className="wr-butterfly-row" key={row.label}>
                  <div className="wr-butterfly-side" data-side="d">
                    <span>{row.d === null ? "—" : money(row.d)}</span>
                    <i data-style={row.style} style={{ width: width(row.d) }} aria-hidden="true" />
                  </div>
                  <span className="wr-butterfly-label">{row.label}</span>
                  <div className="wr-butterfly-side" data-side="r">
                    <i data-style={row.style} style={{ width: width(row.r) }} aria-hidden="true" />
                    <span>{row.r === null ? "—" : money(row.r)}</span>
                  </div>
                </div>
              ))}
            </div>
            {spending.isLoading && <StatusLine>Loading outside spending…</StatusLine>}
            {spending.isError && <StatusLine tone="warn">Outside spending unavailable</StatusLine>}
            {data?.coverage.status === "not_synced" && <StatusLine>FEC independent expenditures not loaded yet</StatusLine>}
          </>
        )}
        <p className="wr-panel-foot">{foot}</p>
      </div>
      <div className="wr-money-side">
        <div className="wr-panel-head"><h3 className="wr-panel-title">Top outside spenders</h3></div>
        {synced && data.topSpenders.length > 0 ? (
          <ul className="wr-spenders">
            {data.topSpenders.slice(0, 5).map((spender) => (
              <li key={spender.committeeId}>
                <span title={spender.committeeName}>{committeeName(spender.committeeName)}</span>
                <span className="wr-mono">{spender.support ? `For ${money(spender.support)}` : ""}{spender.support && spender.oppose ? " · " : ""}{spender.oppose ? `Against ${money(spender.oppose)}` : ""}</span>
              </li>
            ))}
          </ul>
        ) : <StatusLine>{spending.isLoading ? "Loading…" : synced ? "No outside spending reported" : "Not available"}</StatusLine>}
      </div>
    </section>
  );
}
