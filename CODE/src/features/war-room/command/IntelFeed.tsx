import { formatEtTime } from "@/features/election-monitor/constants";
import { useEconIndicators } from "@/features/election-monitor/economy";
import { useMarketMovers } from "@/features/election-monitor/marketHistory";
import { useResultsSourceStatus } from "@/features/election-monitor/mockResults";
import type { KalshiFeedStatus } from "@/features/election-monitor/useKalshiLive";
import { useTopStories } from "@/features/news/topStories";
import { buildFeed, type FeedItem } from "../feed";
import { Panel, StatusLine } from "../panels/Panel";

const TAG_TONE: Record<FeedItem["tag"], string> = { KALSHI: "live", FRED: "fred", NEWS: "news", SYS: "sys", RESULTS: "accent" };

/**
 * What the sources have reported this session, newest first: race counts, the day's biggest Kalshi moves, the FRED
 * sync, results-source checks, and national top stories when news is on. FEC filings join it once a national
 * recent-filings route exists.
 */
export function IntelFeed({ status, counts, countsErrorAt }: {
  status: KalshiFeedStatus;
  counts: { updatedAt: number; races: number; states: number } | null;
  countsErrorAt: number | null;
}) {
  const movers = useMarketMovers("24h", null);
  const indicators = useEconIndicators(730, null);
  const stories = useTopStories();
  const sources = useResultsSourceStatus();
  const items = buildFeed({
    counts,
    countsErrorAt,
    movers: movers.data?.movers ?? [],
    indicators: indicators.data ?? null,
    stories: stories.data?.stories ?? [],
    sources: sources.data ?? [],
  });
  return (
    <Panel flush title="Intel feed"
      meta={status === "live" ? <span className="wr-live-text"><span className="wr-dot wr-pulse" aria-hidden="true" />Streaming</span> : <span>Kalshi {status}</span>}>
      {items.length === 0 ? <StatusLine>Waiting for the first source to answer…</StatusLine> : (
        <ol className="wr-feed" aria-live="polite">
          {items.map((item) => (
            <li key={`${item.tag}-${item.at}-${item.text}`}>
              <time dateTime={item.at}>{formatEtTime(item.at)}</time>
              <span className="wr-tag" data-tone={TAG_TONE[item.tag]}>{item.tag}</span>
              <span>{item.href ? <a href={item.href} target="_blank" rel="noopener noreferrer">{item.text}</a> : item.text}</span>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}
