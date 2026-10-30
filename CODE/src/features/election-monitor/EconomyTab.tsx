import { economyEnabled } from "@/lib/featureFlags";
import { ShareBars, Tiles } from "./DemographicsTab";
import { comparisonFor, useDemographics } from "./demographics";
import { buildTiles, useEconIndicators } from "./economy";
import { EconomyStrip } from "./EconomyStrip";

const ACS_ECONOMY = ["median_household_income", "poverty_rate", "unemployment_rate", "median_home_value", "owner_occupied", "education_ba_plus"];
const INCOME_KEYS = ["income_under_25k", "income_25k_50k", "income_50k_75k", "income_75k_100k", "income_100k_150k", "income_150k_200k", "income_200k_plus"];

/**
 * The economy of the selection: the state's FRED series (jobs, unemployment, claims,
 * GDP, home prices) beside the U.S. series, then household economics from the Census
 * for the exact counties or districts selected. Context, not a forecast.
 */
export function EconomyTab({ stateCode, stateName, counties, districts }: {
  stateCode: string | null;
  stateName: string | null;
  counties: string[];
  districts: string[];
}) {
  const demographics = useDemographics(stateCode, counties, districts);
  const data = demographics.data && demographics.data.selection.state === stateCode ? demographics.data : null;
  const local = counties.length > 0 || districts.length > 0;
  // Same queries as the strips below, so these only decide whether to explain an empty card.
  const stateFred = useEconIndicators(730, stateCode);
  const usFred = useEconIndicators(730, null);
  const hasTiles = (data: typeof stateFred.data, scope: "state" | "national") => Boolean(data && buildTiles(data).some((tile) => tile.scope === scope && !tile.missing));
  const fredNote = (query: typeof stateFred) => <p className="em-brief-hint">{query.isLoading ? "Loading FRED figures…" : "FRED figures are not loaded yet."}</p>;
  return (
    <>
      {economyEnabled && stateCode && (
        <section className="em-card" aria-labelledby="em-econ-state-heading">
          <h3 id="em-econ-state-heading">{stateName ?? stateCode} economy</h3>
          <p>Latest state figures from FRED, each with the U.S. for comparison. Select a tile for its history.</p>
          {hasTiles(stateFred.data, "state") ? <EconomyStrip stateCode={stateCode} stateName={stateName} /> : fredNote(stateFred)}
        </section>
      )}

      {stateCode && (
        <section className="em-card" aria-labelledby="em-econ-acs-heading" aria-busy={demographics.isFetching}>
          <h3 id="em-econ-acs-heading">Household economics{local ? " of the selection" : ""}</h3>
          <p>{local ? "Census figures for the selected counties or districts, compared with the state." : "Census figures for the state, compared with the U.S. Select counties or districts on the map to narrow down."}</p>
          {data?.combined ? (
            <>
              <Tiles data={data} stateCode={stateCode} keys={ACS_ECONOMY} />
              <ShareBars data={data} comparison={comparisonFor(data, stateName, stateCode)} title="Household income" keys={INCOME_KEYS} />
              <p className="em-demo-source">ACS {data.acsYear - 4}–{data.acsYear} 5-year estimates. The Census unemployment rate is a five-year average, so it differs from the monthly BLS rate above.</p>
            </>
          ) : (
            <p className="em-brief-hint">{demographics.isError ? "Census figures unavailable." : "Loading Census figures…"}</p>
          )}
        </section>
      )}

      {economyEnabled && (
        <section className="em-card" aria-labelledby="em-econ-us-heading">
          <h3 id="em-econ-us-heading">U.S. economy</h3>
          <p>{stateCode ? "National indicators FRED has no state series for: inflation, gas, rates, sentiment and more." : "Select a state for its own figures."}</p>
          {hasTiles(usFred.data, "national") ? <EconomyStrip /> : fredNote(usFred)}
        </section>
      )}
    </>
  );
}
