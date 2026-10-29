import type { SourceStatusContract } from "@/features/election-dashboard/types";
import type { IndicatorsData } from "@/features/election-monitor/economy";
import type { Mover } from "@/features/election-monitor/marketHistory";
import type { TopStory } from "@/features/news/topStories";
import { numberFormat } from "@/features/election-monitor/constants";
import { raceLabel } from "./raceCodes";
import { cents } from "./seatTally";

/** One line of the Command intel feed. Every line is something a source actually reported, with its time. */
export interface FeedItem {
  at: string;
  tag: "KALSHI" | "FRED" | "NEWS" | "SYS" | "RESULTS";
  text: string;
  /** An outside link, for news. */
  href?: string;
}

export interface FeedInputs {
  counts: { updatedAt: number; races: number; states: number } | null;
  countsErrorAt: number | null;
  movers: Mover[];
  indicators: IndicatorsData | null;
  stories: TopStory[];
  sources: SourceStatusContract[];
}

const FEED_SIZE = 8;

/** "PA-07", "NC-SEN", or "House control" for the national markets. */
export function moverRace(mover: Pick<Mover, "race" | "scope">) {
  if (mover.scope === "NATIONAL_HOUSE") return "House control";
  if (mover.scope === "NATIONAL_SENATE") return "Senate control";
  return raceLabel(mover.race);
}

export function buildFeed({ counts, countsErrorAt, movers, indicators, stories, sources }: FeedInputs): FeedItem[] {
  const items: FeedItem[] = [];
  const iso = (ms: number) => new Date(ms).toISOString();
  if (counts) items.push({ at: iso(counts.updatedAt), tag: "SYS", text: `Race counts refreshed · ${numberFormat.format(counts.races)} races across ${counts.states} states.` });
  if (countsErrorAt) items.push({ at: iso(countsErrorAt), tag: "SYS", text: "Elections API unreachable · race counts hidden rather than shown as zero." });
  for (const mover of movers.slice(0, 3)) {
    items.push({
      at: mover.toHour,
      tag: "KALSHI",
      text: `${moverRace(mover)} · ${mover.outcome}${mover.party ? ` (${mover.party})` : ""} +${mover.changePts.toFixed(1)} pts in 24h, now ${cents(mover.toPct)}.`,
    });
  }
  if (indicators) {
    const fetched = indicators.series.map((series) => series.fetchedAt).filter((at): at is string => Boolean(at)).sort();
    if (fetched.length) items.push({ at: fetched[fetched.length - 1], tag: "FRED", text: `Indicators synced · ${indicators.series.length} national series.` });
  }
  for (const story of stories.slice(0, 4)) items.push({ at: story.publishedAt, tag: "NEWS", text: `${story.headline} · ${story.outlet}`, href: story.url });
  for (const source of sources) {
    items.push({ at: source.lastCheckedAt, tag: "RESULTS", text: `Results source checked · ${source.isMock ? "fictional fixture" : source.name} · ${source.health.toLowerCase().replace("_", " ")}.` });
  }
  return items.sort((a, b) => b.at.localeCompare(a.at)).slice(0, FEED_SIZE);
}
