import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { HouseYear, PresidentYear } from "@/features/election-monitor/pastResults";
import { HOUSE_2024_MARGIN, impliedSwing, nationalSwings, PRESIDENT_2024_MARGIN } from "./nationalBaseline";

const load = <T,>(name: string): T => JSON.parse(readFileSync(fileURLToPath(new URL(`../../../../public/data/past-results/${name}`, import.meta.url)), "utf8"));

describe("2024 national margins", () => {
  it("match the presidential file", () => {
    const totals = [0, 0, 0];
    for (const { votes } of Object.values(load<PresidentYear>("president-2024.json").states)) votes.forEach((count, i) => (totals[i] += count));
    const margin = ((totals[0] - totals[1]) / (totals[0] + totals[1] + totals[2])) * 100;
    expect(Math.abs(margin - PRESIDENT_2024_MARGIN)).toBeLessThan(0.05);
  });

  it("match the House file", () => {
    let d = 0;
    let r = 0;
    let all = 0;
    for (const races of Object.values(load<HouseYear>("house-2024.json").districts)) {
      for (const race of races) {
        if (race.special || race.stage !== "GEN") continue;
        for (const candidate of race.candidates) {
          if (!candidate.votes || candidate.votes < 0) continue;
          all += candidate.votes;
          if (candidate.party === "D") d += candidate.votes;
          if (candidate.party === "R") r += candidate.votes;
        }
      }
    }
    expect(Math.abs(((d - r) / all) * 100 - HOUSE_2024_MARGIN)).toBeLessThan(0.05);
  });
});

describe("implied swings", () => {
  it("measure the generic ballot against each map's 2024 baseline", () => {
    const { senate, house } = nationalSwings(4.2);
    expect(senate).toEqual({ swing: 5.7, slider: 5.5, capped: false });
    expect(house).toEqual({ swing: 6.9, slider: 7, capped: false });
  });

  it("cap at the sliders' range", () => {
    expect(impliedSwing(-20, 0)).toEqual({ swing: -20, slider: -15, capped: true });
  });
});
