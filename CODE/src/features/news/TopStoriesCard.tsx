import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { formatEtTime } from "@/features/election-monitor/constants";
import { AiBadge, Headline } from "./StoryParts";
import { NEWS_PATH, outletsLabel, timeAgo, TOPICS, useTopStories } from "./topStories";
import "./news.css";

const RAIL_COUNT = 5;

/**
 * The top five political stories of the past 24 hours, in the monitor's lower rail.
 * A story about one state can select that state on the map.
 */
export function TopStoriesCard({ onSelectState }: { onSelectState: (state: string) => void }) {
  const query = useTopStories();
  // Fixed per render pass; the card refetches every ten minutes, which refreshes the times.
  const [now] = useState(() => Date.now());
  const stories = (query.data?.stories ?? []).slice(0, RAIL_COUNT);
  const total = query.data?.stories.length ?? 0;

  return (
    <section className="em-rail-card nw-rail" aria-labelledby="nw-rail-heading">
      <div className="em-rail-head">
        <h2 id="nw-rail-heading">Top stories <AiBadge method={query.data?.method ?? null} /></h2>
        <span>Past 24 hours</span>
      </div>

      {query.isLoading && <p className="em-rail-empty" role="status">Loading top stories…</p>}
      {query.isError && <p className="em-rail-empty" role="status">Top stories are unavailable right now.</p>}
      {query.data && stories.length === 0 && <p className="em-rail-empty">No top stories from the past 24 hours yet.</p>}

      {stories.length > 0 && (
        <ol className="nw-rail-list">
          {stories.map((story) => (
            <li key={story.url}>
              <div>
                <Headline story={story} />
                <p className="nw-rail-meta">
                  <strong>{story.outlet}</strong>
                  <time dateTime={story.publishedAt}>{timeAgo(story.publishedAt, now)}</time>
                  <span>{TOPICS[story.topic].label}</span>
                  {story.outletCount > 1 && <span>{outletsLabel(story.outletCount)}</span>}
                  {story.stateCode && (
                    <button type="button" className="nw-state" onClick={() => onSelectState(story.stateCode!)} aria-label={`Show ${story.stateCode} on the map`}>
                      {story.stateCode}
                    </button>
                  )}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <div className="nw-rail-foot">
        <Link to={NEWS_PATH}>{total > RAIL_COUNT ? `All ${total} top stories` : "Open top stories"}<ArrowRight aria-hidden="true" /></Link>
        {query.data?.updatedAt && (
          <p>{query.data.method === "AI" ? "Picked by AI" : "Ranked by coverage"} · updated {formatEtTime(query.data.updatedAt)} ET</p>
        )}
      </div>
    </section>
  );
}
