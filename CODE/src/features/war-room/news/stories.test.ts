import { describe, expect, it } from "vitest";
import type { TopStory } from "@/features/news/topStories";
import { statesIn, storiesFor, topicsIn } from "./stories";

const story = (rank: number, stateCode: string | null, topic: TopStory["topic"]): TopStory => ({
  rank, headline: `Story ${rank}`, snippet: null, outlet: "Outlet", outletDomain: "outlet.test", url: `https://outlet.test/${rank}`,
  publishedAt: "2026-10-30T12:00:00Z", topic, stateCode, outletCount: 1, alsoCoveredBy: [],
});
const all = [story(1, "PA", "CAMPAIGN"), story(2, null, "POLLS"), story(3, "GA", "VOTING"), story(4, "PA", "POLLS"), story(5, null, "CAMPAIGN")];

describe("War Room news filters", () => {
  it("splits a state's own stories from national ones", () => {
    const { local, national } = storiesFor(all, { state: "PA", topic: null });
    expect(local.map((item) => item.rank)).toEqual([1, 4]);
    expect(national.map((item) => item.rank)).toEqual([2, 5]);
  });

  it("filters by topic, and keeps everything for the nation", () => {
    expect(storiesFor(all, { state: null, topic: "POLLS" }).local.map((item) => item.rank)).toEqual([2, 4]);
    expect(storiesFor(all, { state: null, topic: null }).local).toHaveLength(5);
  });

  it("lists topics by count and states alphabetically", () => {
    expect(topicsIn(all)).toEqual([{ topic: "CAMPAIGN", count: 2 }, { topic: "POLLS", count: 2 }, { topic: "VOTING", count: 1 }]);
    expect(statesIn(all)).toEqual(["GA", "PA"]);
  });
});
