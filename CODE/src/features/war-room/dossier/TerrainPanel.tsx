import { decisiveRace, presidentResult, raceResult, usePastYear, type AreaResult, type HouseYear, type PresidentYear, type SenateYear } from "@/features/election-monitor/pastResults";
import { isRedistricted } from "@/features/election-monitor/map/redistricting";
import { pastResultsEnabled } from "@/lib/featureFlags";
import { Panel, StatusLine } from "../panels/Panel";
import { partyColor } from "../party";
import { raceDistrict, raceState } from "../raceCodes";
import { demMargin, marginText } from "../terrain";

/** Margins past this many points run off the end of the bar, labelled. */
const SCALE = 15;
const SENATE_ROWS = 3;

function Bar({ result }: { result: AreaResult }) {
  const margin = demMargin(result);
  const width = margin === null ? 0 : (Math.min(Math.abs(margin), SCALE) / SCALE) * 50;
  return (
    <span className="wr-margin-bar" aria-hidden="true">
      <span className="wr-margin-mid" />
      {margin !== null && width > 0 && (
        <span style={margin > 0 ? { right: "50%", width: `${width}%`, background: partyColor("D") } : { left: "50%", width: `${width}%`, background: partyColor("R") }} />
      )}
    </span>
  );
}

/**
 * Past margins from the MIT Election Lab files: the last two presidential races statewide, and the state's last
 * Senate races or the district's 2024 House race. District lines only match the map's for 2024, so no earlier
 * House row is shown. Governor races are not in the federal files.
 */
export function TerrainPanel({ id, code }: { id: string; code: string }) {
  const state = raceState(code);
  const house = raceDistrict(code) !== null;
  const p24 = usePastYear<PresidentYear>("president", 2024);
  const p20 = usePastYear<PresidentYear>("president", 2020);
  const s24 = usePastYear<SenateYear>("senate", house ? null : 2024);
  const s22 = usePastYear<SenateYear>("senate", house ? null : 2022);
  const s20 = usePastYear<SenateYear>("senate", house ? null : 2020);
  const s18 = usePastYear<SenateYear>("senate", house ? null : 2018);
  const h24 = usePastYear<HouseYear>("house", house ? 2024 : null);
  if (!pastResultsEnabled) return <Panel id={id} title="Terrain · past margins"><StatusLine>Past results are switched off</StatusLine></Panel>;

  const president = (query: typeof p24, year: number) => ({
    label: `${year} Pres${house ? " · state" : ""}`,
    loading: query.isLoading,
    result: query.data ? presidentResult(query.data.states[state]?.votes, query.data.candidates) : null,
  });
  const rows = [
    ...(house ? [{ label: isRedistricted(state) ? "2024 House · old lines" : "2024 House", loading: h24.isLoading, result: h24.data ? raceResult(decisiveRace(h24.data.districts[code])) : null }] : []),
    president(p24, 2024),
    ...(!house
      ? ([[s24, 2024], [s22, 2022], [s20, 2020], [s18, 2018]] as const)
        .filter(([query]) => query.isLoading || Boolean(query.data?.states[state]?.length))
        .slice(0, SENATE_ROWS)
        .map(([query, year]) => ({ label: `${year} Sen`, loading: query.isLoading, result: query.data ? raceResult(decisiveRace(query.data.states[state])) : null }))
      : []),
    president(p20, 2020),
  ];
  const failed = [p24, p20, s24, s22, s20, s18, h24].some((query) => query.isError);

  return (
    <Panel id={id} title="Terrain · past margins" meta="MIT Election Lab" footnote={`Scale ±${SCALE} pts · shares of all votes cast${failed ? " · some years failed to load" : ""}`}>
      <div className="wr-margin-axis" aria-hidden="true"><span>◀ D</span><span>Even</span><span>R ▶</span></div>
      <dl className="wr-margins">
        {rows.map((row) => {
          const text = row.result ? marginText(row.result) : row.loading ? "…" : "Unavailable";
          const margin = row.result ? demMargin(row.result) : null;
          return (
            <div key={row.label}>
              <dt>{row.label}</dt>
              <dd>{row.result ? <Bar result={row.result} /> : <span className="wr-margin-bar" aria-hidden="true"><span className="wr-margin-mid" /></span>}</dd>
              <dd style={{ color: margin === null ? undefined : partyColor(margin > 0 ? "D" : "R") }}>{text}</dd>
            </div>
          );
        })}
      </dl>
    </Panel>
  );
}
