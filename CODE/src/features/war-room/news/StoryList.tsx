import { TOPICS, timeAgo, etClock, type TopStory } from "@/features/news/topStories";

/** Headlines in War Room type: rank, topic, outlet and age, linking to the publisher. */
export function StoryList({ stories, now, compact = false, label }: { stories: TopStory[]; now: number; compact?: boolean; label: string }) {
  return (
    <ol className="wr-news" data-compact={compact || undefined} aria-label={label}>
      {stories.map((story) => (
        <li key={story.url}>
          <a href={story.url} target="_blank" rel="noopener noreferrer">
            <span className="wr-news-meta">
              <span className="wr-news-topic">{TOPICS[story.topic].label}</span>
              {story.stateCode && <span className="wr-news-state">{story.stateCode}</span>}
              <span>{story.outlet}</span>
              <time dateTime={story.publishedAt} title={etClock(story.publishedAt)}>{timeAgo(story.publishedAt, now)}</time>
            </span>
            <strong>{story.headline}</strong>
            {!compact && story.snippet && <span className="wr-news-snippet">{story.snippet}</span>}
            {story.outletCount > 1 && <span className="wr-news-also">Covered by {story.outletCount} outlets</span>}
          </a>
        </li>
      ))}
    </ol>
  );
}
