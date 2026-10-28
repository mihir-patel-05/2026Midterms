import { useState } from "react";
import { ChevronDown, ExternalLink, Sparkles } from "lucide-react";
import { etDateTime, outletsLabel, timeAgo, TOPICS, type TopStory } from "./topStories";

export function TopicTag({ topic }: { topic: TopStory["topic"] }) {
  const { label, icon: Icon } = TOPICS[topic];
  return (
    <span className="nw-topic">
      <Icon aria-hidden="true" />
      {label}
    </span>
  );
}

/** A story about one state's race or government; links to that state on the monitor. */
export function StateChip({ code, href }: { code: string; href?: string }) {
  return href
    ? <a className="nw-state" href={href} aria-label={`See ${code} on the election monitor`}>{code}</a>
    : <span className="nw-state">{code}</span>;
}

export function AiBadge({ method }: { method: "AI" | "RANKED" | null }) {
  if (method !== "AI") return null;
  return (
    <span className="nw-ai" title="Selected by an AI model from headlines and snippets. Every headline is the publisher's own.">
      <Sparkles aria-hidden="true" />
      AI-selected
    </span>
  );
}

/** Up to ten dots, one per outlet that ran the story: a quick read of how widely it was covered. */
export function CoverageMeter({ count }: { count: number }) {
  if (count < 2) return <span className="nw-coverage">1 outlet</span>;
  const dots = Math.min(count, 10);
  return (
    <span className="nw-coverage" title={`Covered by ${outletsLabel(count)} in the past 24 hours`}>
      <span className="nw-coverage-dots" aria-hidden="true">
        {Array.from({ length: 10 }, (_, index) => <i key={index} data-on={index < dots || undefined} />)}
      </span>
      <span>{outletsLabel(count)}</span>
    </span>
  );
}

export function StoryByline({ story, now }: { story: TopStory; now: number }) {
  return (
    <p className="nw-byline">
      <strong>{story.outlet}</strong>
      <span aria-hidden="true">·</span>
      <time dateTime={story.publishedAt} title={etDateTime(story.publishedAt)}>{timeAgo(story.publishedAt, now)}</time>
    </p>
  );
}

/** The other outlets that ran the story, behind a toggle so the list stays scannable. */
export function AlsoCovered({ story }: { story: TopStory }) {
  const [open, setOpen] = useState(false);
  if (story.alsoCoveredBy.length === 0) return null;
  const more = story.outletCount - 1 - story.alsoCoveredBy.length;
  return (
    <div className="nw-also">
      <button type="button" aria-expanded={open} onClick={() => setOpen(!open)}>
        Also covered by {story.alsoCoveredBy.length + Math.max(0, more)} more
        <ChevronDown aria-hidden="true" />
      </button>
      {open && (
        <ul>
          {story.alsoCoveredBy.map((item) => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noopener noreferrer">{item.outlet}<ExternalLink aria-hidden="true" /></a>
            </li>
          ))}
          {more > 0 && <li className="nw-also-more">and {outletsLabel(more)} more</li>}
        </ul>
      )}
    </div>
  );
}

/** The publisher's headline, linking out in a new tab. */
export function Headline({ story, as: Tag = "h3" }: { story: TopStory; as?: "h2" | "h3" }) {
  // The last word and the icon wrap together, so the icon never sits alone on a line.
  const split = story.headline.lastIndexOf(" ") + 1;
  return (
    <Tag className="nw-headline">
      <a href={story.url} target="_blank" rel="noopener noreferrer">
        {story.headline.slice(0, split)}
        <span className="nw-nowrap">{story.headline.slice(split)}<ExternalLink aria-hidden="true" /></span>
        <span className="sr-only"> (opens {story.outlet} in a new tab)</span>
      </a>
    </Tag>
  );
}
