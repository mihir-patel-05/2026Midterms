import { lazy, Suspense, useCallback, useMemo } from "react";
import { stateMapItems } from "@/features/election-dashboard/map";
import type { Readiness } from "../types";
import type { MapTarget } from "./ElectionMap";
import "../monitor.css";

const ElectionMap = lazy(() => import("./ElectionMap"));

/** States-only map for pages outside the dashboard (e.g. /elections). */
export function StatesMap({ racesByState, onSelectState }: { racesByState: Record<string, number> | undefined; onSelectState: (code: string) => void }) {
  const readiness = useMemo(
    () => Object.fromEntries(stateMapItems.map((item) => [item.code, racesByState?.[item.code] ? "ready" : "pending"])) as Record<string, Readiness>,
    [racesByState],
  );
  const describe = useCallback((target: MapTarget) => {
    const name = stateMapItems.find((item) => item.code === target.state)?.name ?? target.state;
    const races = racesByState?.[target.state];
    return { title: name, lines: [races === undefined ? (racesByState ? "No races on file" : "Loading…") : `${races} ${races === 1 ? "race" : "races"} on file`] };
  }, [racesByState]);

  return (
    <Suspense fallback={<div className="em-map-frame"><div className="em-map-loading" /></div>}>
      <ElectionMap
        layer="states"
        readiness={readiness}
        selectedState={null}
        selectedDistrict={null}
        initialView={null}
        describe={describe}
        onSelectState={onSelectState}
        onSelectDistrict={(state) => onSelectState(state)}
        onViewChange={() => undefined}
      />
    </Suspense>
  );
}
