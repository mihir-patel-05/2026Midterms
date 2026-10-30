import { useCallback, useMemo } from "react";
import { Link, useLocation, useSearchParams } from "react-router-dom";
import { districtLabel } from "@/features/election-monitor/constants";
import { selectedDistricts } from "@/features/election-monitor/selection";
import type { MapLayer } from "@/features/election-monitor/types";
import { useMonitorParams } from "@/features/election-monitor/useMonitorParams";
import { Theater } from "../command/Theater";
import { STATE_NAMES, raceForSelection } from "../raceCodes";
import { SIM_PATHS } from "../screens";
import { layerPatch, lensSearch, readLens, theaterLayer, type Lens } from "../theater";
import { useBoard } from "../useBoard";
import { IntelPanel } from "./IntelPanel";

/**
 * The map at full height with the intel panel beside it: click a state, district, or county (Shift-click for more)
 * and the panel follows with its seat holders, vote history, demographics, economy, and news.
 */
export function MapScreen() {
  const [params, update] = useMonitorParams();
  const [search, setSearch] = useSearchParams();
  const location = useLocation();
  const lens = readLens(search);
  const layer = theaterLayer(params);
  const live = useBoard();
  const board = useMemo(() => (live.marketCount === null ? { ...live, senate: null, house: null } : live), [live]);
  const target = raceForSelection(params.state, params.district, layer === "districts");
  const districts = selectedDistricts(params);
  const onLens = useCallback((next: Lens) => setSearch((current) => lensSearch(current, next), { replace: true }), [setSearch]);
  const onLayer = useCallback((next: MapLayer) => update(layerPatch(next)), [update]);

  const place = !params.state ? "United States"
    : params.counties.length ? `${params.counties.length} ${params.counties.length === 1 ? "county" : "counties"} · ${params.state}`
      : districts.length > 1 ? `${districts.length} districts · ${params.state}`
        : params.district ? districtLabel(params.state, params.district) : STATE_NAMES[params.state] ?? params.state;
  // The simulator opens on the chamber and state in view; its district parameter is "TX-07".
  const simSearch = new URLSearchParams({
    chamber: layer === "districts" ? "house" : "senate",
    ...(params.state ? { state: params.state } : {}),
    ...(params.state && params.district && layer === "districts" ? { district: `${params.state}-${params.district}` } : {}),
  });

  return (
    <>
      <div className="wr-head">
        <div>
          <div className="wr-eyebrow">OPS // Map // {place}</div>
          <h1 className="wr-page-title">Situation map</h1>
        </div>
        <div className="wr-head-actions">
          {target && <Link className="wr-btn" to={{ pathname: `/war-room/race/${target}`, search: location.search }}>Race dossier →</Link>}
          <Link className="wr-btn" data-tone="accent" to={{ pathname: SIM_PATHS.midterms, search: `?${simSearch}` }}>Simulate this →</Link>
        </div>
      </div>
      <div className="wr-mapscreen">
        <Theater full params={params} update={update} lens={lens} onLens={onLens} onLayer={onLayer} layer={layer} board={board} target={target} />
        <IntelPanel params={params} update={update} districts={districts} />
      </div>
    </>
  );
}
