import { Link } from "react-router-dom";
import { savedAtLabel } from "@/features/simulator/savedForecast";
import { simulatorEnabled } from "@/lib/featureFlags";
import { Panel, StatusLine } from "../panels/Panel";
import { partyColor } from "../party";
import { raceLabel } from "../raceCodes";
import { simulatorLink, useForecastLines, type ForecastLine } from "./forecastLines";

function Line({ line }: { line: ForecastLine }) {
  return (
    <div className="wr-fc-line">
      <span className="wr-fc-code">{raceLabel(line.code)}</span>
      <strong style={{ color: line.winner && line.winner !== "T" ? partyColor(line.winner) : undefined }}>{line.result}</strong>
      <span className="wr-dim">{line.from}</span>
    </div>
  );
}

/** "Your forecast" on a race dossier: this race in the viewer's saved midterm forecast, or how to make one. */
export function ForecastPanel({ id, code }: { id?: string; code: string }) {
  const forecast = useForecastLines([code]);
  if (!simulatorEnabled) return null;
  return (
    <Panel id={id} title="Your forecast" meta={forecast ? `Saved ${savedAtLabel(forecast.saved.savedAt)} · this browser` : "Not saved"}
      footnote="Your own simulator scenario, kept in this browser · not a VoteInformed forecast or a market price">
      {forecast ? (
        <div className="wr-fc">
          {forecast.lines.length ? forecast.lines.map((line) => <Line key={line.code} line={line} />) : <StatusLine>Your forecast has no call for this race</StatusLine>}
          <Link className="wr-btn" to={simulatorLink(code, forecast.saved.scenario)}>Open your forecast in the simulator</Link>
        </div>
      ) : (
        <div className="wr-fc">
          <p className="wr-dim">You haven't saved a forecast yet. Make your calls in the simulator and press "Save forecast"; your call for {raceLabel(code)} then shows here.</p>
          <Link className="wr-btn" to={simulatorLink(code, null)}>Make a forecast</Link>
        </div>
      )}
    </Panel>
  );
}

/** The same, compact, for the map's intel panel: the selected state's Senate race and the district in focus. */
export function ForecastBrief({ codes }: { codes: string[] }) {
  const forecast = useForecastLines(codes);
  if (!simulatorEnabled || !forecast || forecast.lines.length === 0) return null;
  return (
    <section className="wr-fc wr-fc-brief" aria-label="Your saved forecast">
      <div className="wr-fc-head">
        <h3>Your forecast</h3>
        <span className="wr-dim">saved {savedAtLabel(forecast.saved.savedAt)}</span>
      </div>
      {forecast.lines.map((line) => <Line key={line.code} line={line} />)}
      <Link className="wr-fc-open" to={simulatorLink(forecast.lines[0].code, forecast.saved.scenario)}>Open in the simulator</Link>
    </section>
  );
}
