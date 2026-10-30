import { describe, expect, it } from "vitest";
import { contestSearchNames, newsRaceKey, searchName } from "./news";
import type { MonitorContest } from "./types";

const contest = (patch: Partial<MonitorContest>): MonitorContest => ({
  id: "c1", stateCode: "PA", office: "US_SENATE", district: null, title: "", electionDate: null, electionType: "GENERAL", candidates: [], ...patch,
});

describe("news helpers", () => {
  it("builds the race key the API and Kalshi share", () => {
    expect(newsRaceKey(contest({}))).toBe("PA-SEN");
    expect(newsRaceKey(contest({ office: "US_HOUSE", district: "07" }))).toBe("PA-07");
    expect(newsRaceKey(contest({ isFictional: true }))).toBeNull();
    expect(newsRaceKey(undefined)).toBeNull();
  });

  it("turns FEC names into searchable names", () => {
    expect(searchName("MCCORMICK, DAVID H.")).toBe("David H. Mccormick");
    expect(searchName("O'ROURKE, BETO")).toBe("Beto O'Rourke");
    expect(searchName("SMITH, JOHN (JACK) 3RD")).toBeNull();
  });

  it("searches incumbents first, then by money raised", () => {
    const names = contestSearchNames(contest({
      candidates: [
        { id: "a", name: "LOW, AL", party: "D", isIncumbent: false, receipts: 10 },
        { id: "b", name: "HIGH, BO", party: "R", isIncumbent: false, receipts: 900 },
        { id: "c", name: "SEAT, CY", party: "D", isIncumbent: true, receipts: 5 },
      ],
    }));
    expect(names).toEqual(["Cy Seat", "Bo High", "Al Low"]);
  });
});
