import { useTopStories } from "@/features/news/topStories";
import { StatusLine } from "../panels/Panel";
import { useNow } from "../useNow";
import { NEWS_SCREEN } from "../screens";
import { StoryList } from "./StoryList";
import { storiesFor } from "./stories";
import { Link } from "react-router-dom";

/** The selected state's top stories in the intel panel, then the national ones. */
export function StateNews({ state }: { state: string | null }) {
  const query = useTopStories();
  const now = useNow();
  const stories = query.data?.stories ?? [];
  const { local, national } = storiesFor(stories, { state, topic: null });
  return (
    <div className="wr-intel-news">
      {query.isLoading && <StatusLine>Loading top stories…</StatusLine>}
      {query.isError && <StatusLine tone="warn">Top stories unavailable</StatusLine>}
      {query.data && stories.length === 0 && <StatusLine>No top stories from the past 24 hours yet</StatusLine>}
      {state && query.data && stories.length > 0 && (
        local.length > 0
          ? <StoryList stories={local} now={now} compact label={`${state} stories`} />
          : <StatusLine>No {state} story in today's top stories</StatusLine>
      )}
      {(state ? national : local).length > 0 && (
        <>
          {state && <div className="wr-eyebrow wr-intel-sub">National</div>}
          <StoryList stories={(state ? national : local).slice(0, 8)} now={now} compact label="National stories" />
        </>
      )}
      <p className="wr-panel-foot"><Link to={{ pathname: NEWS_SCREEN, search: state ? `?state=${state}` : "" }}>All top stories →</Link> · Past 24 hours · publishers' headlines</p>
    </div>
  );
}
