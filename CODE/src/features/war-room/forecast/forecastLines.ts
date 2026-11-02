import { useMemo } from "react";
import { usePastYear, type HouseYear, type PresidentYear } from "@/features/election-monitor/pastResults";
import { simulateHouse, simulateSenate } from "@/features/simulator/midterms/model";
import { parseHouse, parseSenate } from "@/features/simulator/midterms/useMidtermParams";
import { applyScenario, houseForecastLine, senateForecastLine, useStoredForecast } from "@/features/simulator/savedForecast";
import { isHouseCode, isSenateCode, raceState } from "../raceCodes";
import { SIM_PATHS } from "../screens";

export interface ForecastLine {
  code: string;
  /** null while the baseline year's returns load. */
  winner: "D" | "R" | "T" | null;
  result: string;
  from: string;
}

/**
 * Each race's result in the viewer's saved midterm forecast, worked out with the simulator's own model from the
 * saved scenario, so it matches what the simulator shows. Null when nothing is saved.
 */
export function useForecastLines(codes: string[]) {
  const [saved] = useStoredForecast("midterms");
  const search = useMemo(() => new URLSearchParams(saved?.scenario ?? ""), [saved]);
  const senate = useMemo(() => parseSenate(search).scenario, [search]);
  const house = useMemo(() => parseHouse(search), [search]);
  const wantsSenate = codes.some(isSenateCode);
  const wantsHouse = codes.some(isHouseCode);
  const president = usePastYear<PresidentYear>("president", saved && wantsSenate ? senate.base : null);
  const houseYear = usePastYear<HouseYear>("house", saved && wantsHouse ? house.base : null);
  const presidentData = senate.base !== null && president.data?.year === senate.base ? president.data : null;
  const houseData = house.base !== null && houseYear.data?.year === house.base ? houseYear.data : null;
  const senateWaiting = senate.base !== null && !presidentData && !president.isError;
  const houseWaiting = house.base !== null && !houseData && !houseYear.isError;

  const senateResult = useMemo(() => (saved && wantsSenate && !senateWaiting ? simulateSenate(senate, presidentData) : null), [saved, wantsSenate, senateWaiting, senate, presidentData]);
  const houseResult = useMemo(() => (saved && wantsHouse && !houseWaiting ? simulateHouse(house.picks, houseData, house.swing) : null), [saved, wantsHouse, houseWaiting, house, houseData]);

  if (!saved) return null;
  const swung = senate.swing !== 0 || Object.values(senate.stateSwing).some(Boolean);
  const lines: ForecastLine[] = codes.flatMap((code): ForecastLine[] => {
    if (isSenateCode(code)) {
      const state = senateResult?.states[raceState(code)];
      if (!senateResult) return [{ code, winner: null, result: "…", from: `loading the ${senate.base} returns` }];
      return state ? [{ code, ...senateForecastLine(state, senate.base, swung) }] : [];
    }
    if (isHouseCode(code)) {
      const seat = houseResult?.districts[code];
      if (!houseResult) return [{ code, winner: null, result: "…", from: `loading the ${house.base} returns` }];
      return seat ? [{ code, ...houseForecastLine(seat, house.base, house.swing) }] : [];
    }
    return [];
  });
  return { saved, lines };
}

/** The midterm simulator opened on `code`'s chamber and state, with the saved forecast in place. */
export function simulatorLink(code: string, scenario: string | null) {
  const view = new URLSearchParams();
  if (isHouseCode(code)) {
    view.set("chamber", "house");
    view.set("district", code);
  }
  view.set("state", raceState(code));
  const search = scenario === null ? view : applyScenario("midterms", view, scenario);
  return { pathname: SIM_PATHS.midterms, search: `?${search.toString()}` };
}
