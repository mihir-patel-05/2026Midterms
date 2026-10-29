import { DemographicsError, useDemographics, type DemographicMetric } from "@/features/election-monitor/demographics";
import { demographicsEnabled } from "@/lib/featureFlags";
import { Panel, StatusLine } from "../panels/Panel";
import { money } from "./dossier";

const NO_COUNTIES: string[] = [];
const count = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
const TILES: Array<{ key: string; label: string; format: (metric: DemographicMetric) => string }> = [
  { key: "population", label: "Population", format: (metric) => count.format(metric.value!) },
  { key: "cvap", label: "Citizens 18+", format: (metric) => count.format(metric.value!) },
  { key: "median_household_income", label: "Median HH income", format: (metric) => money(metric.value!) },
  { key: "education_ba_plus", label: "Bachelor's+", format: (metric) => `${(metric.value! * 100).toFixed(1)}%` },
  { key: "poverty_rate", label: "Poverty", format: (metric) => `${(metric.value! * 100).toFixed(1)}%` },
  { key: "unemployment_rate", label: "Unemployment", format: (metric) => `${(metric.value! * 100).toFixed(1)}%` },
];

/** Six ACS 5-year figures for the state or the district. Shows the monitor's notice until the ACS sync has run. */
export function ProfilePanel({ id, state, district }: { id: string; state: string; district: string | null }) {
  const districts = district ? [district] : NO_COUNTIES;
  const query = useDemographics(demographicsEnabled ? state : null, NO_COUNTIES, districts);
  const data = query.data;
  const byKey = new Map((data?.combined ?? []).map((metric) => [metric.key, metric]));
  const notLoaded = query.error instanceof DemographicsError && query.error.notLoaded;
  return (
    <Panel id={id} flush title="Profile · ACS 5-year" meta={district ? "District · 119th Congress lines" : "Statewide"}
      footnote={data ? `${data.source.dataset} · ${data.source.attribution}` : undefined}>
      {!demographicsEnabled ? <StatusLine>Demographics are switched off</StatusLine>
        : query.isLoading ? <StatusLine>Loading Census estimates…</StatusLine>
          : notLoaded ? <StatusLine>Census data not loaded yet</StatusLine>
            : query.isError ? <StatusLine tone="warn">Demographics unavailable</StatusLine>
              : !data?.combined ? <StatusLine>No Census figures for this area</StatusLine>
                : (
                  <dl className="wr-profile">
                    {TILES.map((tile) => {
                      const metric = byKey.get(tile.key);
                      return (
                        <div key={tile.key}>
                          <dt>{tile.label}</dt>
                          <dd>{metric?.value === null || metric?.value === undefined ? "—" : tile.format(metric)}{metric?.lowReliability ? " *" : ""}</dd>
                        </div>
                      );
                    })}
                  </dl>
                )}
    </Panel>
  );
}
