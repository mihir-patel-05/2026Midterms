import { describe, expect, it } from "vitest";
import {
  answerKey,
  averageHeadline,
  emptyCopy,
  errorCopy,
  fieldDates,
  formatShare,
  isOtherChoice,
  marginLabel,
  partyShort,
  pollColumns,
  sampleDescription,
  sampleLabel,
  shareFor,
  shortDate,
} from "./pollFormat";
import { raceCodeFor, type Poll, type PollAverage } from "./polls";

const average = (overrides: Partial<PollAverage> = {}): PollAverage => ({
  status: "none",
  method: "polls-avg-v1",
  windowDays: 30,
  asOf: "2026-10-28",
  pollIds: [],
  pollsterCount: 0,
  newestEndDate: null,
  candidates: [],
  leaderKey: null,
  margin: null,
  ...overrides,
});

let next = 0;
const poll = (answers: Array<[string, number, string | null]>, overrides: Partial<Poll> = {}): Poll => ({
  id: `p${++next}`,
  pollster: "Emerson",
  sponsors: [],
  startDate: "2026-10-18",
  endDate: "2026-10-20",
  sampleSize: 1000,
  population: "LV",
  isInternal: false,
  url: null,
  inAverage: true,
  answers: answers.map(([choice, pct, candidateFecId]) => ({ choice, pct, party: null, candidateFecId })),
  ...overrides,
});

describe("race codes", () => {
  it("builds Senate and House codes and rejects anything else", () => {
    expect(raceCodeFor("US_SENATE", "pa", null)).toBe("PA-SEN");
    expect(raceCodeFor("SENATE", "GA", "3")).toBe("GA-SEN");
    expect(raceCodeFor("US_HOUSE", "PA", "7")).toBe("PA-07");
    expect(raceCodeFor("HOUSE", "AK", "00")).toBe("AK-00");
    expect(raceCodeFor("US_HOUSE", "PA", null)).toBeNull();
    expect(raceCodeFor("US_HOUSE", "PA", "at-large")).toBeNull();
    expect(raceCodeFor("STATEWIDE_EXECUTIVE", "PA", null)).toBeNull();
    expect(raceCodeFor("US_SENATE", "EXX", null)).toBeNull();
  });
});

describe("labels", () => {
  it("formats field dates within a month, across months, and across years", () => {
    expect(fieldDates("2026-10-18", "2026-10-20")).toBe("Oct 18–20, 2026");
    expect(fieldDates("2026-09-28", "2026-10-02")).toBe("Sep 28 – Oct 2, 2026");
    expect(fieldDates("2025-12-30", "2026-01-02")).toBe("Dec 30, 2025 – Jan 2, 2026");
    expect(fieldDates(null, "2026-10-20")).toBe("Oct 20, 2026");
    expect(fieldDates("2026-10-20", "2026-10-20")).toBe("Oct 20, 2026");
    expect(fieldDates("2026-10-18", "2026-10-20", 2026)).toBe("Oct 18–20");
    expect(fieldDates("2026-09-28", "2026-10-02", 2026)).toBe("Sep 28 – Oct 2");
    expect(fieldDates("2025-12-30", "2026-01-02", 2026)).toBe("Dec 30, 2025 – Jan 2, 2026");
    expect(fieldDates("2025-10-18", "2025-10-20", 2026)).toBe("Oct 18–20, 2025");
    expect(shortDate("2026-10-25", 2026)).toBe("Oct 25");
    expect(shortDate("2025-10-25", 2026)).toBe("Oct 25, 2025");
  });

  it("describes samples, with gaps stated rather than invented", () => {
    expect(sampleLabel({ sampleSize: 1204, population: "LV" })).toBe("1,204 LV");
    expect(sampleLabel({ sampleSize: null, population: "RV" })).toBe("RV");
    expect(sampleLabel({ sampleSize: 800, population: "UNKNOWN" })).toBe("800");
    expect(sampleLabel({ sampleSize: null, population: "UNKNOWN" })).toBe("—");
    expect(sampleDescription({ sampleSize: 1204, population: "LV" })).toBe("1,204 likely voters");
    expect(sampleDescription({ sampleSize: 800, population: "UNKNOWN" })).toBe("800 respondents");
  });

  it("shortens parties and shares", () => {
    expect(["DEM", "REP", "IND", "LIB", "GRN", "OTH", null].map(partyShort)).toEqual(["D", "R", "I", "L", "G", null, null]);
    expect([47, 46.5, null].map(formatShare)).toEqual(["47", "46.5", "—"]);
    expect(isOtherChoice("Undecided")).toBe(true);
    expect(isOtherChoice("Otherson")).toBe(false);
    expect(answerKey({ choice: " Osborn ", candidateFecId: null })).toBe("name:osborn");
    expect(answerKey({ choice: "Brown", candidateFecId: "S6OH00001" })).toBe("S6OH00001");
  });
});

describe("columns and margins", () => {
  const brown = { key: "S1", name: "Brown", party: "DEM" };
  const husted = { key: "S2", name: "Husted", party: "REP" };

  it("takes the average's leaders as columns when there is an average", () => {
    const avg = average({ status: "average", candidates: [{ ...husted, candidateFecId: "S2", pct: 48, polls: 2 }, { ...brown, candidateFecId: "S1", pct: 47, polls: 2 }] });
    expect(pollColumns([], avg)).toEqual([husted, brown]);
  });

  it("otherwise picks the candidates named in the most polls, skipping undecided", () => {
    const polls = [
      poll([["Brown", 47, "S1"], ["Husted", 48, "S2"], ["Undecided", 5, null]]),
      poll([["Brown", 45, "S1"], ["Husted", 46, "S2"], ["Jane Green", 3, null]]),
      poll([["Brown", 44, "S1"], ["Jane Green", 4, null]]),
    ];
    expect(pollColumns(polls, average({ status: "too_few" })).map((column) => column.name)).toEqual(["Brown", "Husted"]);
    expect(shareFor(polls[2], "S2")).toBeNull();
    expect(shareFor(polls[2], "name:jane green")).toBe(4);
  });

  it("labels a poll's margin, a tie, or nothing without both shares", () => {
    expect(marginLabel([brown, husted], [47, 48])).toBe("Husted +1");
    expect(marginLabel([brown, husted], [47.5, 45])).toBe("Brown +2.5");
    expect(marginLabel([brown, husted], [46, 46])).toBe("Tie");
    expect(marginLabel([brown, husted], [46, null])).toBeNull();
    expect(marginLabel([brown], [46])).toBeNull();
    expect(marginLabel([brown, husted], [49, 45], (column) => column.name.toUpperCase())).toBe("BROWN +4");
  });

  it("headlines the average as a lead or a tie, and nothing otherwise", () => {
    const candidates = [{ ...husted, candidateFecId: "S2", pct: 48.2, polls: 3 }, { ...brown, candidateFecId: "S1", pct: 46.2, polls: 3 }];
    expect(averageHeadline(average({ status: "average", candidates, leaderKey: "S2", margin: 2 }))).toBe("Husted +2.0");
    expect(averageHeadline(average({ status: "average", candidates, leaderKey: null, margin: null }))).toBe("Tied");
    expect(averageHeadline(average({ status: "too_few" }))).toBeNull();
  });
});

describe("empty and error states", () => {
  it("never reads a missing average as a tie or zero", () => {
    expect(emptyCopy(average({ status: "none" }), 0).title).toBe("No public polling");
    expect(emptyCopy(average({ status: "stale", newestEndDate: "2026-08-01" }), 2).copy).toContain("too long ago to average. They are listed below.");
    expect(emptyCopy(average({ status: "too_few" }), 1).title).toBe("Too few polls for an average");
    expect(errorCopy("NOT_CONFIGURED").title).toBe("Polls aren't connected yet");
    expect(errorCopy("NOT_LOADED").title).toBe("Polls haven't loaded yet");
    expect(errorCopy("UNAVAILABLE").title).toBe("Polls unavailable");
  });
});
