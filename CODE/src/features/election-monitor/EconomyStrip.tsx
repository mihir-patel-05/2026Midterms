import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { economyEnabled } from "@/lib/featureFlags";
import { buildTiles, useEconIndicators, type ChangeDirection, type EconTile } from "./economy";
import { IndicatorSparkline } from "./IndicatorSparkline";

const ARROWS: Record<ChangeDirection, typeof ArrowUp> = { up: ArrowUp, down: ArrowDown, flat: Minus };

function Tile({ tile, compact }: { tile: EconTile; compact: boolean }) {
  const Arrow = tile.change ? ARROWS[tile.change.direction] : null;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="em-econ-tile" role="listitem" tabIndex={0} data-missing={tile.missing || undefined}
          aria-label={`${tile.label}: ${tile.value}${tile.change ? `, ${tile.change.text} ${tile.change.basis}` : ""}${tile.period ? `, ${tile.period}` : ""}${tile.stale ? ", stale" : ""}`}>
          <div className="em-econ-head">
            <span>{tile.label}</span>
            {tile.stale && <span className="em-pill" data-tone="amber">Stale</span>}
          </div>
          <div className="em-econ-figures">
            <strong className="em-econ-value">{tile.value}</strong>
            {tile.change && Arrow && (
              <span className="em-econ-change"><Arrow aria-hidden="true" />{tile.change.text}</span>
            )}
          </div>
          {!compact && tile.spark && <IndicatorSparkline {...tile.spark} />}
          {tile.period && <span className="em-econ-period">{tile.period}</span>}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="em-econ-tip">
        {tile.details.map((line) => <p key={line}>{line}</p>)}
        {tile.change && <p>Change: {tile.change.text} {tile.change.basis}</p>}
        {tile.stale && <p>No newer figure has been published to FRED on the usual schedule.</p>}
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * FRED economic indicators under the chamber-control odds. Context only: never
 * presented as a forecast or as the reason the odds moved. Hidden until the
 * backend has synced, and on any error.
 *
 * With a state selected, the strip narrows to that state's figures and hides the
 * tiles FRED only has for the U.S. A state FRED has no series for (Puerto Rico)
 * keeps the national strip.
 */
export function EconomyStrip({ compact = false, stateCode = null, stateName = null }: {
  compact?: boolean;
  stateCode?: string | null;
  stateName?: string | null;
}) {
  const { data } = useEconIndicators(730, stateCode);
  if (!economyEnabled || !data) return null;
  const tiles = buildTiles(data);
  if (tiles.every((tile) => tile.missing)) return null;
  // While another state loads, the previous response is still shown; label what it is.
  const shownState = tiles[0]?.scope === "state" ? data.state?.code ?? null : null;
  const scopeName = shownState && shownState === stateCode ? stateName ?? shownState : shownState;
  return (
    <section className="em-econ" data-compact={compact || undefined}
      aria-label={scopeName ? `Economic indicators for ${scopeName} from FRED` : "Economic indicators from FRED"}>
      {scopeName && <p className="em-econ-scope">{scopeName} <span>state figures</span></p>}
      <div className="em-econ-row" role="list">
        {tiles.map((tile) => <Tile key={tile.id} tile={tile} compact={compact} />)}
      </div>
      {!compact && (
        <p className="em-econ-note">
          Economic data via FRED (Federal Reserve Bank of St. Louis).
          {scopeName && ` ${scopeName} figures: unemployment and jobs from BLS, jobless claims from the Department of Labor (not seasonally adjusted), GDP from BEA, and home prices from FHFA.`}
          {" "}Shown for context, not as a forecast or an explanation of market odds.
        </p>
      )}
    </section>
  );
}
