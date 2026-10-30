import { describe, expect, it } from "vitest";
import type { RaceOutsideSpending } from "@/lib/api";
import type { MonitorContest } from "@/features/election-monitor/types";
import { spendingSides } from "./spending";

const spending = (...candidates: Array<[string | null, number, number]>): RaceOutsideSpending => ({
  cycle: 2026, state: "NC", office: "S", district: null, total: 0, topSpenders: [],
  coverage: { status: "complete", lastSyncedAt: null, latestExpenditureDate: null },
  candidates: candidates.map(([candidateId, support, oppose]) => ({ candidateId, candidateName: null, support, oppose, total: support + oppose })),
});
const contest: MonitorContest = {
  id: "c", stateCode: "NC", office: "US_SENATE", district: null, title: "U.S. Senate", electionDate: null, electionType: "GENERAL",
  candidates: [
    { id: "1", name: "Cooper", party: "DEMOCRATIC PARTY", fecId: "S1", isIncumbent: false },
    { id: "2", name: "Whatley", party: "REPUBLICAN PARTY", fecId: "S2", isIncumbent: false },
    { id: "3", name: "Bray", party: "LIBERTARIAN PARTY", fecId: "S3", isIncumbent: false },
  ],
};

describe("spendingSides", () => {
  it("keeps support and opposition apart on each side", () => {
    expect(spendingSides(spending(["S1", 22, 38], ["S2", 31, 19]), contest)).toEqual({ forD: 22, againstR: 19, forR: 31, againstD: 38, other: 0 });
  });

  it("counts money about third parties or unmatched candidates apart", () => {
    expect(spendingSides(spending(["S3", 1, 2], [null, 4, 0], ["S9", 0, 5]), contest).other).toBe(12);
  });

  it("puts nothing on a side before the ballot list loads", () => {
    expect(spendingSides(spending(["S1", 22, 38]), undefined)).toEqual({ forD: 0, againstR: 0, forR: 0, againstD: 0, other: 60 });
  });
});
