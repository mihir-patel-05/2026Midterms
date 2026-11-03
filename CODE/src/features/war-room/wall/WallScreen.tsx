import { useCallback, useEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from "react";
import { Link, useLocation } from "react-router-dom";
import { liveResultsEnabled } from "@/lib/featureFlags";
import { ChamberControl } from "../command/ChamberControl";
import { useWarRoomFlags } from "../flags";
import { Health, KeyRaces, NightFigures, SLOTS, Timeline } from "../night/NightOps";
import { Badge, Panel, StatusLine } from "../panels/Panel";
import { LiveCoverage } from "../results/LiveCoverage";
import { MarketCountPanel } from "../results/MarketAlerts";
import { CallLog, ControlBanner, RaceBoard, SeatCount } from "../results/ResultsPanels";
import { boardOf, useLiveResults } from "../results/useLiveResults";
import { useBoard } from "../useBoard";
import { useNow } from "../useNow";
import { useWatchlist } from "../watchlist";
import {
  DEFAULT_WALL, loadWallLayout, moveTile, saveWallLayout, setColumns, tileLabel, toggleTile, WALL_COLUMNS, WALL_TILES,
  type WallColumns, type WallLayout, type WallTileId,
} from "./wallLayout";

/** Tiles that span the whole row: they are wide tables or timelines. */
const WIDE: ReadonlySet<WallTileId> = new Set(["figures", "seats", "timeline", "board"]);

function useFullscreen(target: RefObject<HTMLElement | null>) {
  const [on, setOn] = useState(false);
  useEffect(() => {
    const sync = () => setOn(document.fullscreenElement !== null && document.fullscreenElement === target.current);
    document.addEventListener("fullscreenchange", sync);
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [target]);
  const supported = typeof document !== "undefined" && typeof document.documentElement.requestFullscreen === "function";
  const toggle = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen?.();
    else void target.current?.requestFullscreen?.().catch(() => undefined);
  }, [target]);
  return { on, supported, toggle };
}

/**
 * Wall mode: the night's panels as a grid of tiles for a TV or a second screen. The viewer picks the tiles, their
 * order and the number of columns; the layout is kept in this browser. Full screen hides the War Room's chrome.
 */
export function WallScreen() {
  const { search } = useLocation();
  const now = useNow();
  const flags = useWarRoomFlags();
  const live = useBoard();
  const board = live.marketCount === null ? { ...live, senate: null, house: null } : live;
  const watch = useWatchlist(board.senate, board.house);
  const results = useLiveResults();
  const liveBoard = boardOf(results);
  const [layout, setLayout] = useState<WallLayout>(loadWallLayout);
  const [editing, setEditing] = useState(false);
  const wall = useRef<HTMLDivElement>(null);
  const fullscreen = useFullscreen(wall);

  const update = (next: WallLayout) => {
    setLayout(next);
    saveWallLayout(next);
  };
  const reset = () => {
    setLayout(DEFAULT_WALL);
    saveWallLayout(null);
  };

  // A tile behind a switch that is off is left out, without changing the saved layout.
  const available = (id: WallTileId) => id !== "market" || flags.market_alerts;
  const shown = layout.tiles.filter(available);

  const tile = (id: WallTileId): ReactNode => {
    switch (id) {
      case "figures": return <NightFigures now={now} markets={board.marketCount} results={results} />;
      case "seats": return liveResultsEnabled && liveBoard
        ? <div className="wr-stack"><ControlBanner board={liveBoard} /><SeatCount board={liveBoard} attribution={liveBoard.attribution} /></div>
        : <Panel title="Seats called and leading"><StatusLine>Appears once a results source answers</StatusLine></Panel>;
      case "odds": return <div className="wr-stack"><ChamberControl senate={board.senate} house={board.house} /></div>;
      case "timeline": return <Timeline now={now} />;
      case "key-races": return <KeyRaces now={now} codes={watch.list} board={board} results={results} />;
      case "calls": return <CallLog board={liveBoard} closings={SLOTS} now={now} />;
      case "market": return <MarketCountPanel compact />;
      case "board": return liveResultsEnabled ? <RaceBoard board={liveBoard} /> : <Panel title="Results board"><StatusLine>Results are switched off</StatusLine></Panel>;
      case "coverage": return <LiveCoverage />;
      case "health": return <Health board={board} results={results} />;
    }
  };

  return (
    <div ref={wall} className="wr-wall" data-fullscreen={fullscreen.on || undefined}>
      <div className="wr-head wr-wall-head">
        <div>
          <div className="wr-eyebrow">OPS // Wall // Nov 3</div>
          <h1 className="wr-page-title">Wall</h1>
        </div>
        <div className="wr-head-actions">
          {liveBoard && <Badge tone={liveBoard.isTestData ? "mock" : "live"}>{liveBoard.isTestData ? "Test data · not results" : `Results · ${liveBoard.source.name}`}</Badge>}
          <div className="wr-seg" role="group" aria-label="Columns">
            {WALL_COLUMNS.map((columns) => (
              <button key={columns} type="button" aria-pressed={layout.columns === columns} onClick={() => update(setColumns(layout, columns as WallColumns))}
                aria-label={`${columns} column${columns === 1 ? "" : "s"}`}>{columns}</button>
            ))}
          </div>
          <button type="button" className="wr-btn" aria-pressed={editing} onClick={() => setEditing(!editing)}>{editing ? "Done" : "Edit tiles"}</button>
          {fullscreen.supported && <button type="button" className="wr-btn" onClick={fullscreen.toggle}>{fullscreen.on ? "Exit full screen" : "Full screen"}</button>}
          {!fullscreen.on && <Link className="wr-btn" to={{ pathname: "/war-room/night", search }}>Night screen</Link>}
        </div>
      </div>

      {editing && (
        <Panel title="Wall tiles" meta={<button type="button" className="wr-btn" onClick={reset}>Reset</button>}
          footnote="Saved in this browser only. Tiles behind a switch an admin turned off are hidden.">
          <ol className="wr-wall-editor">
            {WALL_TILES.filter((item) => available(item.id)).map((item) => {
              const index = layout.tiles.indexOf(item.id);
              const on = index >= 0;
              return (
                <li key={item.id}>
                  <label>
                    <input type="checkbox" checked={on} onChange={() => update(toggleTile(layout, item.id))} />
                    {item.label}
                  </label>
                  {on && (
                    <span className="wr-wall-move">
                      <button type="button" className="wr-btn" disabled={index === 0} onClick={() => update(moveTile(layout, item.id, -1))} aria-label={`Move ${item.label} earlier`}>↑</button>
                      <button type="button" className="wr-btn" disabled={index === layout.tiles.length - 1} onClick={() => update(moveTile(layout, item.id, 1))} aria-label={`Move ${item.label} later`}>↓</button>
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </Panel>
      )}

      {shown.length === 0 ? (
        <StatusLine>No tiles on the wall. Choose some with Edit tiles.</StatusLine>
      ) : (
        <div className="wr-wall-grid" data-cols={layout.columns} style={{ "--wr-wall-cols": layout.columns } as CSSProperties}>
          {shown.map((id) => (
            <div key={id} className="wr-wall-tile" data-wide={WIDE.has(id) || undefined} aria-label={tileLabel(id)} role="group">
              {tile(id)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
