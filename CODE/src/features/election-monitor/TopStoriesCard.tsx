import { ExternalLink } from "lucide-react";
import { formatEtTime } from "./constants";
import { safeHref, useTopStories, type TopStoriesData, type TopStoryItem } from "./topStories";

const etDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "America/New_York" });

/** "3h ago", or the ET date for anything older than a day. */
function age(iso: string) {
  const hours = (Date.now() - new Date(iso).getTime()) / 3_600_000;
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))}m ago`;
  if (hours < 24) return `${Math.round(hours)}h ago`;
  return etDate(iso);
}

function header(data: TopStoriesData) {
  const when = data.updatedAt ? ` · updated ${formatEtTime(data.updatedAt)} ET` : "";
  return `Ranked by how many outlets cover each story and its Google News placement${when}.`;
}

function StoryRow({ item }: { item: TopStoryItem }) {
  const others = item.outletCount - 1;
  const href = safeHref(item.url);
  return (
    <li>
      {href ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className="em-news-link">
          <span className="em-news-headline">{item.headline}</span>
          <ExternalLink className="em-movers-external" aria-hidden="true" />
        </a>
      ) : (
        <span className="em-news-link"><span className="em-news-headline">{item.headline}</span></span>
      )}
      <p className="em-news-meta">
        <span>{item.outlet}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={item.publishedAt}>{age(item.publishedAt)}</time>
        {others > 0 && (
          <>
            <span aria-hidden="true">·</span>
            <span title={item.alsoCoveredBy.length ? `Also: ${item.alsoCoveredBy.map((entry) => entry.outlet).join(", ")}` : undefined}>
              {others} more {others === 1 ? "outlet" : "outlets"}
            </span>
          </>
        )}
      </p>
    </li>
  );
}

/**
 * National election stories from Google News, collected through Apify and ranked in code
 * by a published trending score. Every item links to its publisher.
 */
export function TopStoriesCard() {
  const stories = useTopStories();
  const data = stories.data;

  return (
    <section className="em-rail-card em-news" aria-labelledby="em-news-heading">
      <div className="em-rail-head">
        <h2 id="em-news-heading">Top election stories</h2>
        {data?.mode === "trending" && <span>Trending</span>}
      </div>

      {stories.isLoading && <p className="em-rail-empty" role="status">Loading stories…</p>}
      {stories.isError && <p className="em-rail-empty" role="status">Top stories are unavailable right now.</p>}
      {data?.mode === "none" && <p className="em-rail-empty">{data.reason ?? "No recent coverage found."}</p>}

      {data && data.items.length > 0 && (
        <>
          <ol className="em-news-list">
            {data.items.map((item) => <StoryRow key={item.articleId} item={item} />)}
          </ol>
          <p className="em-movers-note">
            {header(data)} Chosen from {data.consideredCount} election {data.consideredCount === 1 ? "story" : "stories"} in the past 48 hours.
            {data.reason && ` ${data.reason}`}
          </p>
        </>
      )}
      <details className="em-movers-method">
        <summary>How this is ranked</summary>
        <ul>
          <li>Headlines come from Google News: US top stories, the U.S. section, and national election searches, collected about every 2 hours through Apify.</li>
          <li>Articles that share a link or a headline, or that Google groups as the same story, count as one story.</li>
          <li>Score = (ln(1 + outlets covering it) + a bonus of 1 if Google ranked it in its top 5 in the past 6 hours, or 0.5 for its top 15), halved for every 12 hours since its newest article.</li>
          <li>Only election stories are listed: ones an election search returned, or whose headline uses an election term. The same terms apply to every party, and outlets are never ranked by politics.</li>
          <li>Headlines link to the publisher. We don't store or rewrite article text.</li>
        </ul>
      </details>
    </section>
  );
}
