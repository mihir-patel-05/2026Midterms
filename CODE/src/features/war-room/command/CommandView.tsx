import { useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { stateMapItems } from "@/features/election-dashboard/map";
import type { Mover } from "@/features/election-monitor/marketHistory";
import { useStateCounts } from "@/features/election-monitor/realData";
import type { MapLayer } from "@/features/election-monitor/types";
import { useMonitorParams } from "@/features/election-monitor/useMonitorParams";
import { moversEnabled } from "@/lib/featureFlags";
import { targetSearch } from "../links";
import { MacroTicker } from "../MacroTicker";
import { MoversPanel } from "../MoversPanel";
import { ComingSoonPanel } from "../panels/ComingSoonPanel";
import { STATE_NAMES, raceForSelection, raceState } from "../raceCodes";
import { layerPatch, lensSearch, readLens, theaterLayer, type Lens } from "../theater";
import { useBoard } from "../useBoard";
import { useWatchlist } from "../watchlist";
import { ChamberControl } from "./ChamberControl";
import { IntelFeed } from "./IntelFeed";
import { KeyFigures } from "./KeyFigures";
import { TargetCard } from "./TargetCard";
import { Theater } from "./Theater";
import { WatchlistPanel } from "./WatchlistPanel";

/** The War Room home: chamber control, the theater map and its target, the watchlist, movers, and the feed. */
export function CommandView() {
  const [params, update] = useMonitorParams();
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const lens = readLens(search);
  const layer = theaterLayer(params);
  const live = useBoard();
  // Until the first Kalshi snapshot every count would read 0, so the views wait for it.
  const board = useMemo(() => (live.marketCount === null ? { ...live, senate: null, house: null } : live), [live]);
  const watch = useWatchlist(board.senate, board.house);
  const target = raceForSelection(params.state, params.district, layer === "districts");

  const counts = useStateCounts();
  const races = counts.data ? Object.values(counts.data).reduce((sum, value) => sum + value, 0) : null;
  const states = counts.data ? stateMapItems.filter((item) => (counts.data[item.code] ?? 0) > 0).length : 0;

  const focusRace = useCallback((code: string) => {
    navigate({ search: targetSearch(location.search, raceState(code), code) }, { replace: true });
    document.getElementById("theater")?.scrollIntoView({ block: "nearest" });
  }, [navigate, location.search]);
  const onLens = useCallback((next: Lens) => setSearch((current) => lensSearch(current, next), { replace: true }), [setSearch]);
  const onLayer = useCallback((next: MapLayer) => update(layerPatch(next)), [update]);
  const onMover = useCallback((mover: Mover) => {
    if (!mover.stateCode) return;
    focusRace(mover.scope === "HOUSE_DISTRICT" ? mover.race : `${mover.stateCode}-SEN`);
  }, [focusRace]);

  return (
    <>
      <div className="wr-head">
        <div>
          <div className="wr-eyebrow">OPS // Command // {params.state ? STATE_NAMES[params.state] ?? params.state : "United States"}</div>
          <h1 className="wr-page-title">National situation</h1>
        </div>
        <div className="wr-head-actions">
          <div className="wr-seg" data-size="lg" role="group" aria-label="Phase">
            <Link to={{ pathname: "/war-room", search: location.search }} aria-current="page">Pre-election</Link>
          </div>
          <a className="wr-btn" data-tone="solid" href="#watchlist">Watchlist · {watch.list.length}</a>
        </div>
      </div>

      <div className="wr-grid-3">
        <ChamberControl senate={board.senate} house={board.house} />
        <KeyFigures board={board} races={races} />
      </div>

      <div className="wr-split">
        <Theater params={params} update={update} lens={lens} onLens={onLens} onLayer={onLayer} layer={layer} board={board} target={target} />
        <aside className="wr-aside" aria-label="Target and watchlist">
          <TargetCard code={target} state={params.state} board={board}
            watching={target ? watch.list.includes(target) : false} onToggleWatch={watch.toggle} onShowDistricts={() => onLayer("districts")} />
          <WatchlistPanel watch={watch} board={board} onPick={focusRace} />
        </aside>
      </div>

      <div className="wr-grid-panels">
        {moversEnabled && <MoversPanel onSelect={onMover} />}
        <IntelFeed status={board.status} counts={counts.data && counts.dataUpdatedAt ? { updatedAt: counts.dataUpdatedAt, races: races ?? 0, states } : null}
          countsErrorAt={counts.isError && counts.errorUpdatedAt ? counts.errorUpdatedAt : null} />
        <ComingSoonPanel title="Tipping point · Senate" description="The Senate seats most likely to decide control, from 10,000 simulated elections." />
      </div>

      <MacroTicker />

      <footer className="wr-footer">
        <span>Src: FEC · Kalshi live · FRED · MIT Election Lab · seat holders from congress-legislators</span>
        <span>Market prices are not forecasts or results</span>
      </footer>
    </>
  );
}
