import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { DASHBOARD_PATH } from "@/components/shell/navLinks";
import { AiBadge, AlsoCovered, CoverageMeter, Headline, StateChip, StoryByline, TopicTag } from "@/features/news/StoryParts";
import { etClock, selectionSummary, topicCounts, TOPICS, useTopStories, type NewsTopic, type TopStoriesData, type TopStory } from "@/features/news/topStories";
import "@/features/news/news.css";

const stateHref = (code: string) => `${DASHBOARD_PATH}?state=${code}`;

/** Re-renders every minute so "12 min ago" stays true on an open page. */
function useMinuteClock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function LeadStory({ story, now }: { story: TopStory; now: number }) {
  return (
    <article className="nw-lead" aria-labelledby="nw-lead-headline">
      <div className="nw-lead-rank" aria-hidden="true">1</div>
      <div className="nw-lead-body">
        <div className="nw-tags">
          <span className="nw-lead-label">Top story</span>
          <TopicTag topic={story.topic} />
          {story.stateCode && <StateChip code={story.stateCode} href={stateHref(story.stateCode)} />}
        </div>
        <h2 className="nw-headline nw-headline-lead" id="nw-lead-headline">
          <a href={story.url} target="_blank" rel="noopener noreferrer">
            {story.headline}
            <span className="sr-only"> (opens {story.outlet} in a new tab)</span>
          </a>
        </h2>
        {story.snippet && <p className="nw-snippet">{story.snippet}</p>}
        <div className="nw-meta">
          <StoryByline story={story} now={now} />
          <CoverageMeter count={story.outletCount} />
        </div>
        <AlsoCovered story={story} />
      </div>
    </article>
  );
}

function StoryRow({ story, rank, now }: { story: TopStory; rank: number; now: number }) {
  return (
    <li className="nw-row">
      <span className="nw-rank" aria-label={`Number ${rank}`}>{rank}</span>
      <article>
        <div className="nw-tags">
          <TopicTag topic={story.topic} />
          {story.stateCode && <StateChip code={story.stateCode} href={stateHref(story.stateCode)} />}
        </div>
        <Headline story={story} />
        {story.snippet && <p className="nw-snippet nw-snippet-clamp">{story.snippet}</p>}
        <div className="nw-meta">
          <StoryByline story={story} now={now} />
          <CoverageMeter count={story.outletCount} />
        </div>
        <AlsoCovered story={story} />
      </article>
    </li>
  );
}

function SkeletonList() {
  return (
    <div className="nw-skeleton" role="status" aria-label="Loading top stories">
      <div className="nw-skel nw-skel-lead" />
      {Array.from({ length: 4 }, (_, index) => <div key={index} className="nw-skel nw-skel-row" />)}
    </div>
  );
}

function HowWePick({ method }: { method: TopStoriesData["method"] }) {
  return (
    <section className="nw-card" aria-labelledby="nw-method-heading" id="how-we-pick">
      <h2 id="nw-method-heading">How we pick</h2>
      <ol className="nw-steps">
        <li><strong>Search.</strong> Every two hours we search Google News for U.S. political coverage from the past day, using eight general searches such as "Senate race" and "early voting". No search names a candidate, party, or outlet.</li>
        <li><strong>Clean.</strong> Social media, press releases, official and campaign sites, and repeat links are dropped. Articles about the same event are grouped into one story.</li>
        <li><strong>Pick.</strong> An AI model (Claude) chooses the most important stories: new developments with consequences for elections, government, and policy, and how widely they were covered. Which outlet published a story, which side it helps, and its tone are not allowed to count.</li>
        <li><strong>Publish.</strong> The AI returns story numbers and topics only. Every headline and summary is the publisher's own, and every link goes to the publisher.</li>
      </ol>
      <p className="nw-fine">
        {method === "RANKED"
          ? "The AI is not running right now, so this list is ranked by how many outlets covered each story, with newer stories first."
          : "If the AI is unavailable, the list is ranked by how many outlets covered each story instead, and this page says so."}
        {" "}Only stories from the past 24 hours are shown.
      </p>
    </section>
  );
}

export default function News() {
  const query = useTopStories();
  const now = useMinuteClock();
  const [topic, setTopic] = useState<NewsTopic | null>(null);
  const data = query.data;
  const all = useMemo(() => data?.stories ?? [], [data]);
  const topics = useMemo(() => topicCounts(all), [all]);
  // A topic that drops out of a refreshed list falls back to all stories.
  const activeTopic = topic && topics.some((item) => item.topic === topic) ? topic : null;
  const shown = activeTopic ? all.filter((story) => story.topic === activeTopic) : all;
  const [lead, ...rest] = shown;
  const summary = data ? selectionSummary(data) : "";

  return (
    <AppShell>
      <div className="nw-page">
        <header className="nw-head">
          <p className="nw-eyebrow"><span className="nw-live" aria-hidden="true" />Past 24 hours</p>
          <h1>Top political stories</h1>
          <p className="nw-sub">
            The most important U.S. political news of the last day, from outlets across the country.
          </p>
          {data && (summary || data.method) && (
            <p className="nw-summary">
              <AiBadge method={data.method} />
              <span>{summary}</span>
              <a href="#how-we-pick">How we pick</a>
            </p>
          )}
        </header>

        {topics.length > 1 && (
          <div className="nw-filters" role="group" aria-label="Filter by topic">
            <button type="button" aria-pressed={activeTopic === null} onClick={() => setTopic(null)}>
              All <span>{all.length}</span>
            </button>
            {topics.map((item) => {
              const { label, icon: Icon } = TOPICS[item.topic];
              return (
                <button key={item.topic} type="button" aria-pressed={activeTopic === item.topic} onClick={() => setTopic(activeTopic === item.topic ? null : item.topic)}>
                  <Icon aria-hidden="true" />{label} <span>{item.count}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="nw-layout">
          <div className="nw-main">
            {query.isLoading && <SkeletonList />}
            {query.isError && (
              <div className="nw-empty" role="status">
                <h2>Top stories are unavailable right now</h2>
                <p>The news service did not respond. Try again in a few minutes.</p>
                <button type="button" onClick={() => void query.refetch()}>Try again</button>
              </div>
            )}
            {data && all.length === 0 && (
              <div className="nw-empty" role="status">
                <h2>No top stories from the past 24 hours yet</h2>
                <p>
                  {data.checkedAt
                    ? `News was last checked at ${etClock(data.checkedAt)}. The list refreshes every two hours.`
                    : "The first news check has not run yet. The list refreshes every two hours once it starts."}
                </p>
              </div>
            )}
            {lead && <LeadStory key={lead.url} story={lead} now={now} />}
            {rest.length > 0 && (
              <ol className="nw-list" aria-label={activeTopic ? `More ${TOPICS[activeTopic].label} stories` : "More top stories"}>
                {rest.map((story, index) => <StoryRow key={story.url} story={story} rank={index + 2} now={now} />)}
              </ol>
            )}
          </div>

          <aside className="nw-aside">
            <HowWePick method={data?.method ?? null} />
            {data?.attribution && <p className="nw-fine nw-attribution">{data.attribution}</p>}
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
