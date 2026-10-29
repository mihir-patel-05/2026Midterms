import { useMemo } from "react";
import { useOddsView, type SeatHolder } from "@/features/election-monitor/oddsMap";
import { useKalshiMarkets } from "@/features/election-monitor/useKalshiLive";

/**
 * Both chambers' odds views from the one shared Kalshi stream, plus the House holders once their file has loaded.
 * Every War Room screen reads markets through here, so none opens a stream of its own.
 */
export function useBoard() {
  const senate = useOddsView(true, "senate");
  const house = useOddsView(true, "house");
  const { status, markets } = useKalshiMarkets();
  const houseView = house.view;
  const holders = useMemo(() => {
    if (!houseView || !house.holdersAsOf) return null;
    const map = new Map<string, SeatHolder>();
    for (const race of houseView.races.values()) if (race.holder) map.set(race.code, race.holder);
    return map;
  }, [houseView, house.holdersAsOf]);
  return {
    status,
    /** Markets on the board; null until the first snapshot, so a count never shows 0 for "not loaded". */
    marketCount: markets.size > 0 || status === "live" ? markets.size : null,
    senate: senate.view,
    house: houseView,
    holders,
    holdersAsOf: house.holdersAsOf,
  };
}

export type Board = ReturnType<typeof useBoard>;
