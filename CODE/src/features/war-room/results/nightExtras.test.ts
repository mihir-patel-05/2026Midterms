import { describe, expect, it } from "vitest";
import type { DashboardBootstrapResponse, ElectionResultsResponseContract } from "@/features/election-dashboard/types";
import { chamberCount, HOUSE_CODES, indexBootstrap, SENATE_CODES } from "./liveResults";
import { advanceCalls, controlDecided, majorityStatus, RETRACTIONS_KEPT } from "./nightExtras";
import { callTrackerSnapshot, dismissAlert, observeBoard, resetCallTracker } from "./callTracker";

const snapshotAlerts = () => callTrackerSnapshot().alerts;
import { SENATE_NOT_UP } from "@/features/simulator/midterms/races2026";

const meta = {
  contractVersion: "1.1.0", generatedAt: "2026-11-04T02:00:00.000Z", updatedAt: "2026-11-04T02:00:00.000Z", dataMode: "LIVE" as const,
  isMockData: false, responseStatus: "PARTIAL" as const, freshness: "FRESH" as const, coverage: "PARTIAL" as const, limitations: [], request: {},
  source: {
    providerKey: "civicapi", name: "civicAPI", url: "https://civicapi.org", type: "OTHER" as const, health: "CURRENT" as const, isMock: false,
    updatedAt: "2026-11-04T02:00:00.000Z", lastCheckedAt: "2026-11-04T02:00:00.000Z", lastSuccessfulAt: "2026-11-04T02:00:00.000Z", expectedUpdateIntervalSeconds: 30,
  },
};

function result(code: string, rows: Array<[string, string, number, number]>, extra: Partial<NonNullable<ElectionResultsResponseContract["data"]>> = {}): ElectionResultsResponseContract {
  const [state, seat] = code.split("-");
  const senate = seat === "SEN";
  const candidates = rows.map(([name, party], index) => ({
    id: `p-${name}`, candidacyId: `c-${name}`, displayName: name, party: { name: party === "D" ? "Democratic" : party === "R" ? "Republican" : "Independent", abbreviation: party },
    ballotOrder: index + 1, isWriteIn: false,
  }));
  return {
    data: {
      snapshotId: `s-${code}`, election: { id: "e", name: "2026 General", electionDate: "2026-11-03", type: "GENERAL", status: "OPEN", cycle: 2026, jurisdiction: { id: "us", type: "NATIONAL", name: "United States" } },
      contest: { id: `contest-${code}`, electionId: "e", officeType: senate ? "US_SENATE" : "US_HOUSE", officeTitle: code, jurisdiction: { id: state, type: "STATE", name: state, stateCode: state }, ...(senate ? {} : { districtCode: seat }) },
      reportingUnit: { id: "u", type: "STATE", name: state, stateCode: state },
      candidates,
      candidateResults: rows.map(([name, , votes, percentage]) => ({ candidateId: `p-${name}`, candidacyId: `c-${name}`, votes, percentage, updatedAt: meta.updatedAt })),
      reportingUnitResults: [],
      totalVotes: rows.reduce((sum, row) => sum + row[2], 0),
      reportingProgress: { reportingUnits: { reported: null, total: null, percentage: null }, precincts: { reported: null, total: null, percentage: null }, estimatedPercentage: 64 },
      status: "IN_PROGRESS", certificationState: "UNOFFICIAL", updatedAt: meta.updatedAt,
      ...extra,
    },
    meta,
  };
}

const called = (name: string) => [{ candidateId: `p-${name}`, candidacyId: `c-${name}`, kind: "WINNER" as const, calledAt: "2026-11-04T01:30:00.000Z", calledAtIsSourceTime: true, calledBy: "civicAPI decision desk" }];

function bootstrap(results: ElectionResultsResponseContract[]): DashboardBootstrapResponse {
  return { data: { manifest: { version: "db-1", states: [] }, results }, meta };
}
const count = (called: { D: number; R: number; other?: number }) => ({ called: { other: 0, ...called }, leading: { D: 0, R: 0, other: 0 }, uncalled: 0, noVotes: 0 });

describe("majority rules", () => {
  const board = indexBootstrap(bootstrap([
    result("GA-SEN", [["Ossoff", "D", 490, 49], ["Collins", "R", 470, 47], ["Smith", "L", 40, 4]]),
    result("GA-07", [["Brooks", "D", 600, 60], ["Hill", "R", 400, 40]]),
    result("ME-SEN", [["Platner", "D", 480, 48], ["Collins", "R", 470, 47], ["Other", "I", 50, 5]]),
    result("AK-00", [["Begich", "R", 0, 0], ["Peltola", "D", 0, 0]], { status: "NOT_STARTED" }),
    result("PA-07", [["Brooks", "D", 480, 48], ["Mackenzie", "R", 470, 47], ["Third", "G", 50, 5]]),
    result("GA-14", [["A", "R", 480, 48], ["B", "R", 470, 47]], { calls: [
      { candidateId: "p-A", candidacyId: "c-A", kind: "ADVANCED" as const, calledAt: meta.updatedAt, calledAtIsSourceTime: true, calledBy: "civicAPI decision desk" },
      { candidateId: "p-B", candidacyId: "c-B", kind: "ADVANCED" as const, calledAt: meta.updatedAt, calledAtIsSourceTime: true, calledBy: "civicAPI decision desk" },
    ] }),
  ]));

  it("flags an uncalled leader under 50% in Georgia, Maine and Alaska only", () => {
    expect(majorityStatus(board.races.get("GA-SEN"))).toMatchObject({ kind: "under-majority", rule: { kind: "runoff" }, leader: { name: "Ossoff" } });
    expect(majorityStatus(board.races.get("ME-SEN"))).toMatchObject({ kind: "under-majority", rule: { kind: "rcv" } });
    expect(majorityStatus(board.races.get("GA-07"))).toBeNull();
    expect(majorityStatus(board.races.get("AK-00"))).toBeNull();
    expect(majorityStatus(board.races.get("PA-07"))).toBeNull();
    expect(majorityStatus(undefined)).toBeNull();
  });

  it("says runoff when the source advances candidates", () => {
    expect(majorityStatus(board.races.get("GA-14"))).toMatchObject({ kind: "runoff-called" });
  });

  it("says nothing once a race is called", () => {
    const calledBoard = indexBootstrap(bootstrap([result("GA-SEN", [["Ossoff", "D", 490, 49], ["Collins", "R", 470, 47]], { calls: called("Ossoff") })]));
    expect(majorityStatus(calledBoard.races.get("GA-SEN"))).toBeNull();
  });
});

describe("control decided", () => {
  it("needs 51 Senate seats, or 50 for the vice president's party, and 218 House seats", () => {
    expect(controlDecided(count({ D: 50, R: 49, other: 1 }), count({ D: 200, R: 210 }))).toEqual([]);
    expect(controlDecided(count({ D: 51, R: 48 }), count({ D: 0, R: 0 }))).toEqual([{ chamber: "Senate", party: "D", seats: 51, tiebreak: false }]);
    expect(controlDecided(count({ D: 49, R: 50 }), count({ D: 0, R: 0 }))).toEqual([{ chamber: "Senate", party: "R", seats: 50, tiebreak: true }]);
    expect(controlDecided(count({ D: 40, R: 52 }), count({ D: 218, R: 100 }))).toEqual([
      { chamber: "Senate", party: "R", seats: 52, tiebreak: false },
      { chamber: "House", party: "D", seats: 218, tiebreak: false },
    ]);
  });

  it("counts only called seats, with the holdovers", () => {
    const board = indexBootstrap(bootstrap([result("GA-SEN", [["Ossoff", "D", 900, 90], ["Collins", "R", 100, 10]])]));
    expect(controlDecided(chamberCount(board, SENATE_CODES, SENATE_NOT_UP), chamberCount(board, HOUSE_CODES))).toEqual([]);
  });
});

describe("retracted calls", () => {
  const withCall = indexBootstrap(bootstrap([result("GA-SEN", [["Ossoff", "D", 520, 52], ["Collins", "R", 480, 48]], { calls: called("Ossoff") }), result("PA-07", [["Brooks", "D", 10, 50], ["Hill", "R", 10, 50]])]));
  const withoutCall = indexBootstrap(bootstrap([result("GA-SEN", [["Ossoff", "D", 520, 52], ["Collins", "R", 480, 48]]), result("PA-07", [["Brooks", "D", 10, 50], ["Hill", "R", 10, 50]])]));
  const raceGone = indexBootstrap(bootstrap([result("PA-07", [["Brooks", "D", 10, 50], ["Hill", "R", 10, 50]])]));

  it("treats the first board as a baseline with nothing new or retracted", () => {
    const first = advanceCalls(null, withCall, 1);
    expect(first.fresh).toEqual([]);
    expect(first.retractions).toEqual([]);
    expect([...first.calls.keys()]).toEqual(["GA-SEN|p-Ossoff"]);
  });

  it("records a call that disappears while its race stays on the board", () => {
    const next = advanceCalls(advanceCalls(null, withCall, 1), withoutCall, 2);
    expect(next.retractions).toMatchObject([{ code: "GA-SEN", name: "Ossoff", noticedAt: 2 }]);
    expect(next.calls.size).toBe(0);
  });

  it("does not retract when the whole race drops out, and remembers the call", () => {
    const gone = advanceCalls(advanceCalls(null, withCall, 1), raceGone, 2);
    expect(gone.retractions).toEqual([]);
    expect(gone.calls.has("GA-SEN|p-Ossoff")).toBe(true);
    const back = advanceCalls(gone, withCall, 3);
    expect(back.fresh).toEqual([]);
    expect(back.retractions).toEqual([]);
  });

  it("reports a new call once, and starts over when test data switches to live", () => {
    const fresh = advanceCalls(advanceCalls(null, withoutCall, 1), withCall, 2);
    expect(fresh.fresh.map((call) => call.key)).toEqual(["GA-SEN|p-Ossoff"]);
    expect(advanceCalls(fresh, withCall, 3).fresh).toEqual([]);
    const test = { ...withoutCall, isTestData: true };
    expect(advanceCalls(fresh, test, 4)).toMatchObject({ testData: true, retractions: [], fresh: [] });
  });

  it("keeps a bounded list", () => {
    let state = advanceCalls(null, withCall, 0);
    for (let i = 1; i <= RETRACTIONS_KEPT + 5; i++) state = advanceCalls(advanceCalls(state, withoutCall, i), withCall, i);
    expect(state.retractions.length).toBe(RETRACTIONS_KEPT);
  });
});

describe("watchlist alerts", () => {
  const without = indexBootstrap(bootstrap([result("GA-SEN", [["Ossoff", "D", 520, 52], ["Collins", "R", 480, 48]]), result("PA-07", [["Brooks", "D", 10, 50], ["Hill", "R", 10, 50]])]));
  const both = indexBootstrap(bootstrap([
    result("GA-SEN", [["Ossoff", "D", 520, 52], ["Collins", "R", 480, 48]], { calls: called("Ossoff") }),
    result("PA-07", [["Brooks", "D", 10, 50], ["Hill", "R", 10, 50]], { calls: called("Hill") }),
  ]));

  it("alerts only for watched races called after the first board, until dismissed", () => {
    resetCallTracker();
    const read = snapshotAlerts;
    observeBoard(without, ["GA-SEN"], 1);
    expect(read()).toEqual([]);
    observeBoard(both, ["GA-SEN"], 2);
    expect(read().map((alert) => alert.code)).toEqual(["GA-SEN"]);
    observeBoard(both, ["GA-SEN"], 3);
    expect(read().length).toBe(1);
    dismissAlert("GA-SEN|p-Ossoff");
    expect(read()).toEqual([]);
  });

  it("raises nothing for calls already there when the page loads", () => {
    resetCallTracker();
    observeBoard(both, ["GA-SEN", "PA-07"], 1);
    expect(snapshotAlerts()).toEqual([]);
  });
});
