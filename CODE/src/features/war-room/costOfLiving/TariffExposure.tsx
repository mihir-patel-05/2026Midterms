import { STATE_NAMES } from "../raceCodes";
import { StatusLine } from "../panels/Panel";
import { EXPOSURE_COLORS, exposureBand, ordinal, useTariffExposure, type PartKey, type StateExposure, type TariffExposure as Data } from "./costOfLiving";

const UNIT: Record<PartKey, (value: number) => string> = {
  importsToGdp: (value) => `${value.toFixed(1)}% of GDP`,
  partnerShare: (value) => `${value.toFixed(0)}% of imports`,
  manufacturingShare: (value) => `${value.toFixed(1)}% of jobs`,
  dieselChange: (value) => `${value > 0 ? "+" : ""}${value.toFixed(1)}% in a year`,
};

function Parts({ row, data }: { row: StateExposure; data: Data }) {
  return (
    <ul className="wr-tx-parts">
      {data.method.parts.map((part) => {
        const value = row.parts[part.key];
        return (
          <li key={part.key}>
            <span className="wr-tx-label">{part.label}</span>
            {value ? (
              <>
                <span className="wr-tx-value">{UNIT[part.key](value.value)} <span className="wr-dim">· {value.period}{value.regional ? ` · ${value.regional}` : ""}</span></span>
                <span className="wr-tx-bar" role="img" aria-label={`Percentile ${Math.round(value.percentile)} of 100`}><span style={{ width: `${Math.max(value.percentile, 2)}%` }} /></span>
                <span className="wr-tx-pct">p{Math.round(value.percentile)}</span>
              </>
            ) : <span className="wr-tx-value wr-dim">Not available · left out of the score</span>}
          </li>
        );
      })}
    </ul>
  );
}

function Method({ data }: { data: Data }) {
  return (
    <details className="wr-tx-method">
      <summary>How the score works</summary>
      <p>{data.method.formula}</p>
      <ul>{data.method.parts.map((part) => <li key={part.key}><strong>{part.label}:</strong> {part.source}{data.periods[part.key] ? ` (${data.periods[part.key]})` : ""}.</li>)}</ul>
      <ul>{data.method.notes.map((note) => <li key={note}>{note}</li>)}</ul>
      <p className="wr-dim">Method {data.method.version}. Computed in code from public data; no AI.</p>
    </details>
  );
}

/** The tariff exposure score for a state, with its four measures; or the 51-state ranking with no state selected. */
export function TariffExposureCard({ stateCode }: { stateCode: string | null }) {
  const query = useTariffExposure();
  if (query.isLoading) return <StatusLine>Loading tariff exposure…</StatusLine>;
  if (query.isError) return <StatusLine tone="warn">Tariff exposure is unavailable right now.</StatusLine>;
  const data = query.data;
  if (!data) return null;
  const scored = data.states.filter((row) => row.score !== null);
  const head = (
    <header>
      <h3>Tariff exposure</h3>
      <span className="wr-col-area">How much the economy runs through imports, tariffed partners, manufacturing and freight fuel · not a measured cost</span>
    </header>
  );
  if (scored.length === 0) {
    return <section className="wr-col-fuel" aria-label="Tariff exposure">{head}<StatusLine>Not computed yet: it needs Census imports, FRED jobs and GDP, and EIA diesel to be loaded.</StatusLine><Method data={data} /></section>;
  }
  if (!stateCode) {
    return (
      <section className="wr-col-fuel" aria-label="Tariff exposure">
        {head}
        <ol className="wr-tx-rank">
          {scored.map((row) => (
            <li key={row.state}>
              <span className="wr-tx-rank-n">{row.rank}</span>
              <span>{STATE_NAMES[row.state] ?? row.state}</span>
              <span className="wr-tx-bar"><span style={{ width: `${row.score}%`, background: EXPOSURE_COLORS[exposureBand(row.score!)] }} /></span>
              <span className="wr-tx-pct">{row.score!.toFixed(0)}</span>
            </li>
          ))}
        </ol>
        <Method data={data} />
      </section>
    );
  }
  const row = data.states.find((item) => item.state === stateCode);
  const name = STATE_NAMES[stateCode] ?? stateCode;
  return (
    <section className="wr-col-fuel" aria-label="Tariff exposure">
      {head}
      {!row || row.score === null ? (
        <StatusLine>{name} has {row?.partsUsed ?? 0} of the 4 measures; the score needs at least 3.</StatusLine>
      ) : (
        <div className="wr-col-now">
          <i className="wr-tx-swatch" style={{ background: EXPOSURE_COLORS[exposureBand(row.score)] }} aria-hidden="true" />
          <strong>{row.score.toFixed(0)}</strong><span>/ 100</span>
          <span className="wr-col-vs">{ordinal(row.rank!)} most exposed of {scored.length}{row.partsUsed < 4 ? ` · from ${row.partsUsed} of 4 measures` : ""}</span>
        </div>
      )}
      {row && <Parts row={row} data={data} />}
      <Method data={data} />
    </section>
  );
}
