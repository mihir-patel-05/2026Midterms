import { CloudOff, ExternalLink, Loader2, Newspaper } from "lucide-react";
import { districtLabel, formatEtTime } from "./constants";
import { contestSearchNames, newsRaceKey, useRaceNews, useTopNews, type NewsData } from "./news";
import type { MonitorContest } from "./types";

const relative = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

/** "3 hours ago", or the date for anything older than two days. */
function age(iso: string | null, now = Date.now()) {
  if (!iso) return null;
  const minutes = Math.round((Date.parse(iso) - now) / 60_000);
  if (minutes > -60) return relative.format(Math.min(0, minutes), "minute");
  if (minutes > -48 * 60) return relative.format(Math.round(minutes / 60), "hour");
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function Empty({ icon: Icon, title, copy, spin }: { icon: typeof CloudOff; title: string; copy: string; spin?: boolean }) {
  return <div className="em-empty"><Icon aria-hidden="true" className={spin ? "animate-spin" : undefined} /><strong>{title}</strong><span>{copy}</span></div>;
}

function Headlines({ query, emptyCopy }: { query: { data?: NewsData; isLoading: boolean; isError: boolean }; emptyCopy: string }) {
  if (query.isLoading) return <Empty icon={Loader2} spin title="Loading headlines" copy="Searching recent coverage." />;
  if (query.isError && !query.data) return <Empty icon={CloudOff} title="News unavailable" copy="The news service could not be reached. Try again in a few minutes." />;
  const data = query.data;
  if (!data || data.items.length === 0) return <Empty icon={Newspaper} title="No recent coverage found" copy={emptyCopy} />;
  return (
    <>
      <ol className="em-news-list">
        {data.items.map((item) => (
          <li key={item.url}>
            <a href={item.url} target="_blank" rel="noopener noreferrer">
              <strong>{item.headline}</strong>
              <span>
                {item.outlet ?? "Unknown outlet"}
                {item.publishedAt && <time dateTime={item.publishedAt} title={`${formatEtTime(item.publishedAt)} ET`}> · {age(item.publishedAt)}</time>}
                <ExternalLink aria-hidden="true" />
              </span>
            </a>
          </li>
        ))}
      </ol>
      <p className="em-news-meta">Latest coverage, newest first · updated {formatEtTime(data.updatedAt)} ET</p>
    </>
  );
}

/**
 * Headlines for the race in view, then the state's (or the nation's) election
 * coverage. Time-ordered search results, not picked or ranked by AI, and never
 * filtered by outlet or party.
 */
export function NewsTab({ contest, stateCode, stateName }: { contest: MonitorContest | undefined; stateCode: string | null; stateName: string | null }) {
  const raceKey = newsRaceKey(contest);
  const race = useRaceNews(raceKey, contestSearchNames(contest));
  const top = useTopNews(stateCode);
  const raceTitle = contest ? (contest.office === "US_SENATE" ? `${contest.stateCode} Senate` : districtLabel(contest.stateCode, contest.district)) : null;
  const source = race.data?.source ?? top.data?.source;
  return (
    <>
      {raceKey && (
        <section className="em-card" aria-labelledby="em-news-race-heading" aria-busy={race.isFetching}>
          <h3 id="em-news-race-heading">{raceTitle} in the news</h3>
          <p>Coverage of this race from the past week. Pick another contest in Overview to switch.</p>
          <Headlines query={race} emptyCopy="Nothing in the past week mentions this race's candidates or seat." />
        </section>
      )}
      <section className="em-card" aria-labelledby="em-news-top-heading" aria-busy={top.isFetching}>
        <h3 id="em-news-top-heading">{stateCode ? `${stateName ?? stateCode} election headlines` : "National election headlines"}</h3>
        <p>{stateCode ? "Senate, House, and midterm coverage in the state from the past three days." : "Midterm, Senate, and House coverage from the past two days. Select a state or race to narrow it."}</p>
        <Headlines query={top} emptyCopy="No election coverage found for the past few days." />
      </section>
      {source && <p className="em-demo-source">{source.attribution} Links open the publisher's site. Outlets are not filtered or ranked by party or ideology.</p>}
    </>
  );
}
