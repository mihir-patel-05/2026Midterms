import { describe, expect, it } from "vitest";
import { writeCountyScenario } from "../useSimulatorParams";
import { EMPTY_SENATE, type SenateScenario } from "./model";
import { parseHouse, parseSenate, writeHouse, type HouseScenario } from "./useMidtermParams";

describe("midterm links", () => {
  it("leave the defaults out", () => {
    const search = new URLSearchParams();
    writeCountyScenario(search, EMPTY_SENATE);
    writeHouse(search, { base: 2024, swing: 0, picks: {} });
    expect(search.toString()).toBe("");
  });

  it("round-trip the Senate side", () => {
    const senate: SenateScenario = {
      base: 2020,
      swing: 2,
      stateSwing: { GA: -1 },
      counties: { "13121": 40 },
      picks: { ME: { party: "D", rating: "lean" }, NC: { party: "T" } },
    };
    const search = new URLSearchParams();
    writeCountyScenario(search, senate);
    expect(parseSenate(new URLSearchParams(search.toString())).scenario).toEqual(senate);
  });

  it("keeps Senate picks and swings only for states with a race", () => {
    const { scenario } = parseSenate(new URLSearchParams("p=CADs,TXDl&ss=PA2,GA1"));
    expect(scenario.picks).toEqual({ TX: { party: "D", rating: "lean" } });
    expect(scenario.stateSwing).toEqual({ GA: 1 });
  });

  it("round-trip the House side", () => {
    const house: HouseScenario = { base: null, swing: -2.5, picks: { "PA-07": "D", "AK-00": "R", "CA-13": "T" } };
    const search = new URLSearchParams();
    writeHouse(search, house);
    expect(search.get("h")).toBe("PA07D,AK00R,CA13T");
    expect(search.get("hbase")).toBe("blank");
    expect(search.get("hswing")).toBe("-2.5");
    expect(parseHouse(new URLSearchParams(search.toString()))).toEqual(house);
  });

  it("drops districts that do not exist", () => {
    expect(parseHouse(new URLSearchParams("h=PA99D,AK01R,TX38R,ZZ01D")).picks).toEqual({ "TX-38": "R" });
  });
});
