import { describe, expect, it } from "vitest";
import type { DashboardBootstrapResponse, ElectionResultsResponseContract } from "@/features/election-dashboard/types";
import { callFeed, chamberCount, indexBootstrap, leaderOf, progressLabel, resultsBin, resultsBins, resultsFlips, toLiveRace } from "./liveResults";
import { embedUrl } from "./streams";

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

describe("live results", () => {
  const board = indexBootstrap(bootstrap([
    result("GA-SEN", [["Ossoff", "D", 520, 52], ["Collins", "R", 480, 48]], { calls: called("Ossoff") }),
    result("PA-07", [["Brooks", "D", 1000, 49.9], ["Mackenzie", "R", 1004, 50.1]]),
    result("AK-00", [["Begich", "R", 0, 0], ["Peltola", "D", 0, 0]], { status: "NOT_STARTED" }),
    { data: null, meta },
  ]));

  it("indexes contests by race code and counts the ones with no result", () => {
    expect([...board.races.keys()].sort()).toEqual(["AK-00", "GA-SEN", "PA-07"]);
    expect(board.waiting).toBe(1);
    expect(board.attribution).toMatch(/civicAPI/);
  });

  it("orders by votes, says leading until a call, and gives the margin", () => {
    const pa = board.races.get("PA-07")!;
    expect(pa.candidates.map((candidate) => candidate.name)).toEqual(["Mackenzie", "Brooks"]);
    expect(pa.winner).toBeNull();
    expect(leaderOf(pa)?.name).toBe("Mackenzie");
    expect(pa.marginPts).toBeCloseTo(0.2);
    expect(board.races.get("GA-SEN")!.winner?.name).toBe("Ossoff");
    expect(leaderOf(board.races.get("AK-00"))).toBeNull();
  });

  it("labels civicAPI's share as an estimate, never as precincts", () => {
    const pa = board.races.get("PA-07")!;
    expect(progressLabel(pa)).toBe("About 64% of the expected vote counted (civicAPI estimate)");
    expect(progressLabel(pa, true)).toBe("~64%");
  });

  it("counts called and leading seats; unreported races count as no votes, never as anyone's", () => {
    const senate = chamberCount(board, ["GA-SEN", "ME-SEN"], { D: 34, R: 31 });
    expect(senate.called).toEqual({ D: 35, R: 31, other: 0 });
    expect(senate.uncalled).toBe(1);
    expect(senate.noVotes).toBe(1);
    const house = chamberCount(board, ["PA-07", "AK-00"]);
    expect(house.leading).toEqual({ D: 0, R: 1, other: 0 });
    expect(house.noVotes).toBe(1);
    expect(chamberCount(null, ["PA-07"]).noVotes).toBe(1);
  });

  it("lists calls newest first with who called them", () => {
    const feed = callFeed(board);
    expect(feed).toHaveLength(1);
    expect(feed[0]).toMatchObject({ code: "GA-SEN", kind: "WINNER", calledBy: "civicAPI decision desk", sourceTime: true });
  });

  it("shades the map by call and margin, and hatches a leader of the other party", () => {
    expect(resultsBin(board.races.get("GA-SEN"))).toBe("D-call");
    expect(resultsBin(board.races.get("PA-07"))).toBe("R0");
    expect(resultsBin(board.races.get("AK-00"))).toBe("no_votes");
    expect(resultsBin(undefined)).toBe("no_result");
    const bins = resultsBins(board, "senate", ["GA-SEN", "ME-SEN"]);
    expect(bins.get("GA")).toBe("D-call");
    expect(bins.get("ME")).toBe("no_result");
    expect([...resultsFlips(board, "house", ["PA-07"], () => "D")]).toEqual(["PA-07"]);
    expect([...resultsFlips(board, "house", ["PA-07"], () => null)]).toEqual([]);
  });

  it("flags test data on every race that carries it", () => {
    const test = indexBootstrap(bootstrap([result("GA-SEN", [["Ossoff", "D", 1, 100]], { isTestData: true })]));
    expect(test.isTestData).toBe(true);
    expect(toLiveRace({ data: null, meta })).toBeNull();
  });
});

describe("live coverage embeds", () => {
  it("uses the no-cookie player, muted, for a video or a channel's live stream", () => {
    const video = embedUrl({ videoId: "dQw4w9WgXcQ" }, "https://voteinformed.example");
    expect(video).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ\?/);
    expect(video).toContain("mute=1");
    expect(video).toContain("enablejsapi=1");
    const channel = embedUrl({ channelId: "UCaaaaaaaaaaaaaaaaaaaaaa" }, "https://voteinformed.example");
    expect(channel).toMatch(/embed\/live_stream\?.*channel=UCaaaaaaaaaaaaaaaaaaaaaa/);
  });
});
