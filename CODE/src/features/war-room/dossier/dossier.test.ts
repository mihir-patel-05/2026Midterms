import { describe, expect, it } from "vitest";
import type { MonitorCandidate, MonitorContest } from "@/features/election-monitor/types";
import { buildRaceLog, money, pickCandidates } from "./dossier";

const candidate = (name: string, party: string | null, ballotStatus?: "CONFIRMED" | "UNCONFIRMED"): MonitorCandidate => ({ id: name, name, party, isIncumbent: false, ballotStatus });
const contest = (...candidates: MonitorCandidate[]): MonitorContest => ({ id: "c", stateCode: "NC", office: "US_SENATE", district: null, title: "U.S. Senate", electionDate: null, electionType: "GENERAL", candidates });

describe("pickCandidates", () => {
  it("takes the first Democrat and Republican and counts the rest", () => {
    const picked = pickCandidates(contest(candidate("Cooper", "DEMOCRATIC PARTY"), candidate("Whatley", "REPUBLICAN PARTY"), candidate("Bray", "LIBERTARIAN PARTY"), candidate("Other D", "DEMOCRATIC PARTY")));
    expect(picked.d?.name).toBe("Cooper");
    expect(picked.r?.name).toBe("Whatley");
    expect(picked.others).toBe(2);
  });

  it("prefers a confirmed ballot entry", () => {
    const picked = pickCandidates(contest(candidate("Lost primary", "REPUBLICAN PARTY", "UNCONFIRMED"), candidate("Nominee", "REPUBLICAN PARTY", "CONFIRMED")));
    expect(picked.r?.name).toBe("Nominee");
  });

  it("leaves a side empty rather than borrowing another party", () => {
    expect(pickCandidates(contest(candidate("Osborn", "INDEPENDENT"))).d).toBe(null);
    expect(pickCandidates(undefined)).toEqual({ d: null, r: null, others: 0 });
  });
});

describe("buildRaceLog", () => {
  it("lists real events newest first and folds same-day FEC reports together", () => {
    const log = buildRaceLog({
      historyStart: Date.parse("2026-10-15T13:00:00Z"),
      leader: { label: "Democratic", price: 62, change: 3.1, at: Date.parse("2026-10-29T17:00:00Z") },
      candidates: [{ name: "Roy Cooper", fundingThrough: "2026-10-14" }, { name: "Michael Whatley", fundingThrough: "2026-10-14" }],
      spending: { status: "complete", lastSyncedAt: "2026-10-29T09:00:00Z", latestExpenditureDate: "2026-10-28" },
      newestPoll: null,
    });
    expect(log.map((entry) => entry.title)).toEqual(["Kalshi.", "Schedule E sync.", "Outside spending.", "History starts.", "FEC report."]);
    expect(log[0].text).toBe("Democratic +3.1 in 24h, now 62¢.");
    expect(log[4].text).toBe("Roy Cooper and Michael Whatley reported through this date.");
    expect(log[4].dateOnly).toBe(true);
  });

  it("says unchanged rather than 0.0", () => {
    const [entry] = buildRaceLog({ historyStart: null, leader: { label: "Republican", price: 55, change: 0.02, at: 0 }, candidates: [], spending: null, newestPoll: null });
    expect(entry.text).toBe("Republican unchanged in 24h, now 55¢.");
  });

  it("is empty when no source has anything", () => {
    expect(buildRaceLog({ historyStart: null, leader: null, candidates: [], spending: null, newestPoll: null })).toEqual([]);
  });
});

describe("money", () => {
  it("is compact", () => {
    expect(money(48_600_000)).toBe("$48.6M");
    expect(money(950_000)).toBe("$950K");
    expect(money(0)).toBe("$0");
  });
});
