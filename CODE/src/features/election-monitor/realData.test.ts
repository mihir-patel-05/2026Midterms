import { describe, expect, it } from "vitest";
import type { Election } from "@/types/candidate";
import { contestCandidates } from "./realData";

const filing = (id: string, name: string, party: string, receipts: number, isIncumbent = false) => ({
  id: `ce-${id}`, candidateId: id, electionId: "e1", isIncumbent, ballotStatus: "UNCONFIRMED" as const, createdAt: "", updatedAt: "",
  candidate: { id, candidateId: `H6CA07${id}`, name, party, financials: [{ receipts: String(receipts), cashOnHand: "10", coverageEndDate: "2026-10-14T00:00:00Z" }] },
});

const election = (candidacies: NonNullable<Election["normalizedContest"]>["candidacies"]): Election => ({
  id: "e1", state: "CA", district: "07", officeType: "HOUSE", electionDate: "2026-11-03", electionType: "GENERAL", cycle: 2026, createdAt: "", updatedAt: "",
  candidateElections: [
    filing("u1", "MATSUI, DORIS O", "DEM", 900_000, true),
    // Lost the June primary; still an active FEC filer.
    filing("u2", "LOSER, PAT", "REP", 50_000),
  ] as unknown as Election["candidateElections"],
  normalizedContest: { candidacies },
});

describe("contestCandidates", () => {
  it("shows exactly the ballot, with FEC finances where a filing matched", () => {
    const candidates = contestCandidates(election([
      { id: "b1", ballotName: "Doris Matsui", isIncumbent: true, fecCandidateId: "H6CA07u1", legacyCandidateId: "u1", person: { displayName: "Doris Matsui" }, party: { name: "Democratic", abbreviation: "D" } },
      { id: "b2", ballotName: "Jane Doe", isIncumbent: false, fecCandidateId: null, legacyCandidateId: null, person: { displayName: "Jane Doe" }, party: { name: "Democratic", abbreviation: "D" } },
    ]));
    expect(candidates.map((candidate) => [candidate.name, candidate.party, candidate.profileId ?? null, candidate.receipts, candidate.ballotStatus])).toEqual([
      ["Doris Matsui", "Democratic", "u1", 900_000, "CONFIRMED"],
      ["Jane Doe", "Democratic", null, null, "CONFIRMED"],
    ]);
  });

  it("falls back to every FEC filer, incumbent first, until the ballot is on file", () => {
    const candidates = contestCandidates(election([]));
    expect(candidates.map((candidate) => [candidate.name, candidate.ballotStatus])).toEqual([
      ["Doris O Matsui", "UNCONFIRMED"],
      ["Pat Loser", "UNCONFIRMED"],
    ]);
  });
});
