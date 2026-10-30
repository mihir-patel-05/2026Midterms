import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { TOPICS, useTopStories, type NewsTopic } from "@/features/news/topStories";
import { newsEnabled } from "@/lib/featureFlags";
import { NotConnectedPanel } from "../panels/NotConnectedPanel";
import { Badge, Panel, StatusLine } from "../panels/Panel";
import { STATE_NAMES } from "../raceCodes";
import { useNow } from "../useNow";
import { StoryList } from "./StoryList";
import { statesIn, storiesFor, topicsIn } from "./stories";

/** The past 24 hours' top political stories, filtered by topic and state, in the War Room. */
export function NewsScreen() {
  const [search, setSearch] = useSearchParams();
  const query = useTopStories();
  const now = useNow();
  const stories = useMemo(() => query.data?.stories ?? [], [query.data]);
  const topics = useMemo(() => topicsIn(stories), [stories]);
  const states = useMemo(() => statesIn(stories), [stories]);
  const topicParam = search.get("topic") as NewsTopic | null;
  const topic = topicParam && topicParam in TOPICS ? topicParam : null;
  const stateParam = search.get("state");
  const state = stateParam && STATE_NAMES[stateParam] ? stateParam : null;
  const { local, national } = storiesFor(stories, { state, topic });
  const set = (key: string, value: string | null) => setSearch((current) => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value);
    else next.delete(key);
    return next;
  }, { replace: true });
  const data = query.data;

  return (
    <>
      <div className="wr-head">
        <div>
          <div className="wr-eyebrow">OPS // News // {state ? STATE_NAMES[state] : "National"}</div>
          <h1 className="wr-page-title">Top political stories</h1>
        </div>
        <div className="wr-head-actions">
          <label className="wr-select">
            <span className="wr-sr-only">State</span>
            <select value={state ?? ""} onChange={(event) => set("state", event.target.value || null)}>
              <option value="">All states</option>
              {(state && !states.includes(state) ? [...states, state].sort() : states).map((code) => <option key={code} value={code}>{STATE_NAMES[code] ?? code}</option>)}
            </select>
          </label>
        </div>
      </div>

      {!newsEnabled ? (
        <NotConnectedPanel title="Top stories" source="the news service" description="News is switched off in this build." />
      ) : (
        <div className="wr-split">
          <Panel className="wr-news-panel" flush title={state ? `${STATE_NAMES[state]} · past 24 hours` : "Past 24 hours"}
            meta={data?.method ? <Badge tone={data.method === "AI" ? "accent" : undefined}>{data.method === "AI" ? "AI-selected" : "Ranked by coverage"}</Badge> : undefined}
            footnote={data?.attribution ?? "Headlines and summaries are the publishers' own; every link goes to the publisher."}>
            {topics.length > 1 && (
              <div className="wr-news-filters wr-seg" role="group" aria-label="Topic">
                <button type="button" aria-pressed={topic === null} onClick={() => set("topic", null)}>All · {stories.length}</button>
                {topics.map((item) => (
                  <button key={item.topic} type="button" aria-pressed={topic === item.topic} onClick={() => set("topic", topic === item.topic ? null : item.topic)}>
                    {TOPICS[item.topic].label} · {item.count}
                  </button>
                ))}
              </div>
            )}
            {query.isLoading && <StatusLine>Loading top stories…</StatusLine>}
            {query.isError && <StatusLine tone="warn">Top stories unavailable. The news service did not respond.</StatusLine>}
            {data && stories.length === 0 && <StatusLine>No top stories from the past 24 hours yet</StatusLine>}
            {data && stories.length > 0 && local.length === 0 && <StatusLine>{state ? `No ${STATE_NAMES[state]} story matches` : "No story matches this topic"}</StatusLine>}
            {local.length > 0 && <StoryList stories={local} now={now} label={state ? `${state} stories` : "Top stories"} />}
            {state && national.length > 0 && (
              <>
                <div className="wr-eyebrow wr-intel-sub">National</div>
                <StoryList stories={national} now={now} label="National stories" />
              </>
            )}
          </Panel>
          <aside className="wr-aside" aria-label="How stories are picked">
            <Panel title="How we pick">
              <ol className="wr-news-method">
                <li>Every two hours, general political searches of Google News for the past day. No search names a candidate, party, or outlet.</li>
                <li>Social media, press releases, and campaign sites are dropped; articles about one event are grouped.</li>
                <li>An AI model picks the most consequential stories. Outlet, side helped, and tone may not count. If it is down, stories are ranked by how many outlets covered them.</li>
                <li>Headlines, summaries, and links are the publishers' own.</li>
              </ol>
            </Panel>
          </aside>
        </div>
      )}
    </>
  );
}
