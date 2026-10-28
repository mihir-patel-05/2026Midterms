import { describe, expect, it } from "vitest";
import { selectionSummary, timeAgo, topicCounts, type TopStoriesData, type TopStory } from "./topStories";

const NOW = Date.parse("2026-10-28T16:00:00Z");
const story = (topic: TopStory["topic"]): TopStory => ({
  rank: 1, headline: "H", snippet: null, outlet: "O", outletDomain: "o.com", url: `https://o.com/${topic}`,
  publishedAt: "2026-10-28T12:00:00Z", topic, stateCode: null, outletCount: 1, alsoCoveredBy: [],
});
const data = (patch: Partial<TopStoriesData>): TopStoriesData => ({
  windowHours: 24, updatedAt: "2026-10-28T14:32:00Z", checkedAt: null, method: "AI", articlesConsidered: 1840,
  storiesConsidered: 300, attribution: null, stories: [], ...patch,
});

describe("top stories helpers", () => {
  it("says how long ago a story ran, in minutes then hours", () => {
    expect(timeAgo("2026-10-28T15:59:30Z", NOW)).toBe("Just now");
    expect(timeAgo("2026-10-28T15:15:00Z", NOW)).toBe("45 min ago");
    expect(timeAgo("2026-10-28T12:30:00Z", NOW)).toBe("3 hr ago");
    expect(timeAgo("2026-10-27T15:00:00Z", NOW)).toBe("1 day ago");
  });

  it("counts topics in display order, leaving out absent ones", () => {
    expect(topicCounts([story("COURTS"), story("CAMPAIGN"), story("COURTS")])).toEqual([
      { topic: "CAMPAIGN", count: 1 },
      { topic: "COURTS", count: 2 },
    ]);
  });

  it("names who picked the list, from how many articles, and when", () => {
    expect(selectionSummary(data({}))).toBe("Picked by AI from 1,840 articles · updated 10:32 AM ET");
    expect(selectionSummary(data({ method: "RANKED", articlesConsidered: null }))).toBe("Ranked by outlet coverage · updated 10:32 AM ET");
    expect(selectionSummary(data({ method: null, updatedAt: null }))).toBe("");
  });
});
