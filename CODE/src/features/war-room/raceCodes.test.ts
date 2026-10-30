import { describe, expect, it } from "vitest";
import { isRaceCode, normaliseRaceCode, parseRace, raceForSelection, raceLabel, raceTitle } from "./raceCodes";

describe("parseRace", () => {
  it("reads Senate races in several spellings", () => {
    for (const text of ["nc-sen", "NC SEN", "nc senate", "North Carolina", "north carolina senate", "  NC-SEN  "]) {
      expect(parseRace(text)).toEqual({ code: "NC-SEN", state: "NC" });
    }
  });

  it("pads House districts and reads at-large seats", () => {
    expect(parseRace("PA 8")).toEqual({ code: "PA-08", state: "PA" });
    expect(parseRace("pa-08")).toEqual({ code: "PA-08", state: "PA" });
    expect(parseRace("New York 12")).toEqual({ code: "NY-12", state: "NY" });
    expect(parseRace("AK-AL")).toEqual({ code: "AK-00", state: "AK" });
    expect(parseRace("de 0")).toEqual({ code: "DE-00", state: "DE" });
  });

  it("gives a state with no Senate race on its own", () => {
    expect(parseRace("Pennsylvania")).toEqual({ code: null, state: "PA" });
    expect(parseRace("AZ")).toEqual({ code: null, state: "AZ" });
  });

  it("does not confuse states whose names end alike", () => {
    expect(parseRace("West Virginia senate")).toEqual({ code: "WV-SEN", state: "WV" });
    expect(parseRace("Arkansas 1")).toEqual({ code: "AR-01", state: "AR" });
  });

  it("says why a race does not exist", () => {
    expect(parseRace("")).toEqual({ error: "Type a race, like ME-SEN, PA-08 or Ohio." });
    expect(parseRace("PA-SEN")).toEqual({ error: "No Senate race in Pennsylvania this year." });
    expect(parseRace("PA-18")).toEqual({ error: "Pennsylvania has 17 districts." });
    expect(parseRace("AK-01")).toEqual({ error: "Alaska has one at-large seat: AK-AL." });
    expect(parseRace("ZZ-01")).toEqual({ error: 'No race matches "ZZ-01".' });
  });
});

describe("race codes", () => {
  it("knows the 2026 races", () => {
    expect(isRaceCode("NC-SEN")).toBe(true);
    expect(isRaceCode("OH-SEN")).toBe(true);
    expect(isRaceCode("PA-SEN")).toBe(false);
    expect(isRaceCode("DE-00")).toBe(true);
    expect(isRaceCode("DE-01")).toBe(false);
  });

  it("labels at-large seats AL", () => {
    expect(raceLabel("DE-00")).toBe("DE-AL");
    expect(raceLabel("PA-07")).toBe("PA-07");
    expect(raceTitle("PA-07")).toBe("Pennsylvania · District 7");
    expect(raceTitle("DE-00")).toBe("Delaware · At-large");
    expect(raceTitle("NC-SEN")).toBe("North Carolina · U.S. Senate");
  });

  it("maps a map selection to its race", () => {
    expect(raceForSelection("NC", null, false)).toBe("NC-SEN");
    expect(raceForSelection("PA", "07", false)).toBe(null);
    expect(raceForSelection("PA", "07", true)).toBe("PA-07");
    expect(raceForSelection("PA", null, true)).toBe(null);
    expect(raceForSelection(null, null, false)).toBe(null);
  });

  it("normalises dossier URL segments", () => {
    expect(normaliseRaceCode("NC-SEN")).toBe("NC-SEN");
    expect(normaliseRaceCode("pa-7")).toBe("PA-07");
    expect(normaliseRaceCode("AK-AL")).toBe("AK-00");
    expect(normaliseRaceCode("Ohio")).toBe(null);
    expect(normaliseRaceCode("PA-SEN")).toBe(null);
    expect(normaliseRaceCode(undefined)).toBe(null);
  });
});
