import { formatEtTime } from "@/features/election-monitor/constants";
import { StatusLine } from "../panels/Panel";
import { TariffExposureCard } from "./TariffExposure";
import { dollars, fuelLines, fuelRange, NotLoaded, signedDollars, signedPercent, useCostOfLiving, type Change, type FuelView } from "./costOfLiving";

const LABEL = { gasoline: "Regular gasoline", diesel: "Diesel (No. 2)" } as const;
const W = 640;
const H = 160;

function ChangeCell({ label, change, us }: { label: string; change: Change | null; us: Change | null }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd data-dir={change ? Math.sign(change.dollars) : undefined}>{change ? `${signedDollars(change.dollars)} · ${signedPercent(change.percent)}` : "—"}</dd>
      <dd className="wr-col-us">U.S. {us ? signedPercent(us.percent) : "—"}</dd>
    </div>
  );
}

function FuelChart({ view, stateName }: { view: FuelView; stateName: string }) {
  const range = fuelRange(view.history);
  const first = view.history[0]?.date;
  const last = view.history.at(-1)?.date;
  const own = view.area.kind !== "nation";
  return (
    <figure className="wr-col-chart">
      <div className="wr-col-trace">
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" width="100%" height="100%" role="img"
          aria-label={`${LABEL[view.fuel]} weekly price${own ? `, ${view.area.name} against the U.S.` : ", U.S."}, ${first ?? ""} to ${last ?? ""}, ${dollars(range[0])} to ${dollars(range[1])} a gallon`}>
          {own && fuelLines(view.history, "us", range, W, H).map((points, index) => <polyline key={`us-${index}`} points={points} fill="none" stroke="var(--wr-text-3)" strokeWidth={1.5} strokeDasharray="4 3" vectorEffect="non-scaling-stroke" />)}
          {fuelLines(view.history, own ? "value" : "us", range, W, H).map((points, index) => <polyline key={`v-${index}`} points={points} fill="none" stroke={view.fuel === "diesel" ? "var(--wr-accent)" : "var(--wr-live)"} strokeWidth={2} vectorEffect="non-scaling-stroke" />)}
        </svg>
        <span className="wr-col-axis" data-edge="top" aria-hidden="true">${range[1].toFixed(2)}</span>
        <span className="wr-col-axis" data-edge="bottom" aria-hidden="true">${range[0].toFixed(2)}</span>
      </div>
      <figcaption>
        <span>{first} – {last}</span>
        <span><i style={{ background: view.fuel === "diesel" ? "var(--wr-accent)" : "var(--wr-live)" }} />{own ? (view.regional ? view.area.name : stateName) : "U.S."}</span>
        {own && <span><i data-dashed />U.S. average</span>}
      </figcaption>
    </figure>
  );
}

function FuelCard({ view, stateName }: { view: FuelView; stateName: string }) {
  const own = view.area.kind !== "nation";
  return (
    <section className="wr-col-fuel" aria-label={LABEL[view.fuel]}>
      <header>
        <h3>{LABEL[view.fuel]}</h3>
        <span className="wr-col-area" data-regional={view.regional || undefined}>
          {view.area.kind === "state" ? `${view.area.name} · state price` : view.regional ? `Regional average · ${view.area.name} · not a ${stateName} figure` : "U.S. average"}
        </span>
      </header>
      {view.latest ? (
        <>
          <div className="wr-col-now">
            <strong>{dollars(view.latest.value)}</strong><span>/gal · week of {view.latest.date}</span>
            {own && view.vsUs && <span className="wr-col-vs" data-dir={Math.sign(view.vsUs.dollars)}>{signedDollars(view.vsUs.dollars)} vs U.S. ({view.us ? dollars(view.us.value) : "—"})</span>}
          </div>
          {view.stale && <StatusLine tone="warn">Latest week is more than two weeks old; EIA may not have published yet.</StatusLine>}
          <dl className="wr-col-changes">
            <ChangeCell label="1 week" change={view.changes.week} us={view.usChanges.week} />
            <ChangeCell label="1 month" change={view.changes.month} us={view.usChanges.month} />
            <ChangeCell label="1 year" change={view.changes.year} us={view.usChanges.year} />
          </dl>
          <FuelChart view={view} stateName={stateName} />
        </>
      ) : <StatusLine>No {LABEL[view.fuel].toLowerCase()} price stored for {view.area.name}</StatusLine>}
    </section>
  );
}

/**
 * The map's Cost of living tab for the selected state (PLAN.md §4.8): weekly EIA gasoline and diesel prices
 * against the U.S. A state EIA does not price on its own shows its region, labelled. Facts about a place, never
 * a prediction or explanation of how it votes.
 */
export function CostOfLivingTab({ stateCode, stateName }: { stateCode: string | null; stateName: string | null }) {
  const query = useCostOfLiving(stateCode);
  if (query.isLoading) return <StatusLine>Loading fuel prices…</StatusLine>;
  if (query.error instanceof NotLoaded) return <div className="wr-col"><StatusLine>Fuel prices are not loaded yet. They arrive with the weekly EIA sync.</StatusLine><TariffExposureCard stateCode={stateCode} /></div>;
  if (query.isError) return <StatusLine tone="warn">Fuel prices are unavailable right now.</StatusLine>;
  const data = query.data;
  if (!data) return <StatusLine>Cost of living is turned off.</StatusLine>;
  const name = stateName ?? "the U.S.";
  return (
    <div className="wr-col">
      <p className="wr-col-intro">{stateCode ? `${stateName}: weekly retail fuel prices against the U.S. average.` : "U.S. weekly retail fuel prices. Pick a state on the map to compare it."} Diesel moves freight, so it feeds into the price of most goods.</p>
      {data.fuels.map((view) => <FuelCard key={view.fuel} view={view} stateName={name} />)}
      <TariffExposureCard stateCode={stateCode} />
      <p className="wr-col-source">
        Src: <a href={data.source.url} target="_blank" rel="noreferrer">{data.source.name}</a>, weekly retail prices{data.source.fetchedAt ? ` · fetched ${new Date(data.source.fetchedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })} ${formatEtTime(data.source.fetchedAt)} ET` : ""}.
        EIA prices 9 states on their own (diesel: California only); every other state shows its region. Same windows for every state. Context, not a forecast.
      </p>
    </div>
  );
}
