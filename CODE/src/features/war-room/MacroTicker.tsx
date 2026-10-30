import { buildTiles, useEconIndicators, type EconTile } from "@/features/election-monitor/economy";
import { economyEnabled } from "@/lib/featureFlags";

const ARROW = { up: "▲", down: "▼", flat: "■" } as const;

function Item({ tile }: { tile: EconTile }) {
  return (
    <li>
      <span className="wr-tick-label">{tile.label}</span> {tile.value}
      {tile.change && <span className="wr-tick-change"> {ARROW[tile.change.direction]}{tile.change.text}</span>}
    </li>
  );
}

/**
 * FRED headline figures in a scrolling strip. Context only, never a forecast or an explanation of the odds, and
 * changes are in neutral colours because whether a rise is good depends on who is asked. It pauses on hover or
 * focus and stands still with reduced motion.
 */
export function MacroTicker() {
  const indicators = useEconIndicators(730, null);
  if (!economyEnabled) return null;
  const tiles = indicators.data ? buildTiles(indicators.data).filter((tile) => !tile.missing) : [];
  return (
    <section className="wr-ticker" aria-label="Economic indicators from FRED">
      <div className="wr-ticker-key">FRED // Macro</div>
      {tiles.length === 0 ? (
        <p className="wr-status wr-ticker-status" role="status">{indicators.isLoading ? "Loading FRED indicators…" : "FRED indicators not loaded yet"}</p>
      ) : (
        <div className="wr-ticker-window" tabIndex={0} aria-label="FRED indicators, scrolling. Focus to pause.">
          <div className="wr-ticker-track">
            <ul>{tiles.map((tile) => <Item key={tile.id} tile={tile} />)}</ul>
            <ul aria-hidden="true">{tiles.map((tile) => <Item key={tile.id} tile={tile} />)}</ul>
          </div>
        </div>
      )}
    </section>
  );
}
