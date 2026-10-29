# VoteInformed: plan, product ideas, and tech stack

Last updated: October 26, 2026
Election day: Tuesday, November 3, 2026

This is the single planning document for the repo. It replaces all earlier plans, day reports, PRDs, and deployment guides. Those plans covered AWS, Supabase, and Vercel. **Everything now runs on Railway.**

---

## 1. What we are building

VoteInformed is a U.S. election intelligence site. It goes deep on every 2026 federal race instead of wide on the world.

> General dashboards show you the world. VoteInformed shows you every race, every dollar, and every market, and explains what moved.

Differentiators:

1. **District-level depth.** One page per race brings together market odds over time, polls, FEC money, outside spending, the incumbent's record, and local news.
2. **Explanations for movement.** When odds move, the site says why and cites sources.
3. **Disagreement detection.** It flags races where markets, polls, and money disagree.
4. **A layer for voters.** Users can find their races, candidates, records, funders, and deadlines.
5. **Election night.** Live results, race calls, and odds update together for each district.
6. **Trust.** Every number has a source, a timestamp, and a methodology. AI content is labeled.

### Principles (non-negotiable)

- **Nonpartisan.** No endorsements, no ideology-based recommendations, and no "likelihood of socialism/fascism" style indexes. Every party gets the same prompts, fields, and evidence rules.
- **Numbers come from code, not AI.** Odds, money, polls, votes, and indexes come from APIs and deterministic formulas. AI only reads text, connects events to numbers, and explains them with citations.
- **Market prices are not forecasts.** Label them "market price" and show the provider, price type, and fetch time.
- **Missing is not zero.** Unknown, stale, partial, and unavailable data each get their own visible state. "No public polling" is not a 0.
- **Privacy.** Street addresses never go into logs, analytics, URLs, or durable storage. After lookup we keep only the district ID. We never collect anyone's intended vote.
- **Mock data is always labeled.** Fictional fixtures (`ZZ`/`EX` identities) carry `MOCK` labels and can never be shown as live data.

---

## 2. Where we are (as of Oct 14)

**Shipped**

- New "election monitor" frontend as the home page: a MapLibre map with state, House district, and county layers, plus Overview, Counties, and Finance tabs and global search.
- FEC candidates, committees, and detailed totals loaded through bulk sync, rate-limited to 1,000 calls per hour.
- Address-to-2026-district lookup through Geocodio, with redistricting flags on the map.
- Live Kalshi prices: one authenticated WebSocket covering about 913 markets across 451 races (415 of 435 House seats), fanned out to browsers over SSE (`/api/prediction-markets/kalshi/stream`). Kalshi REST quotes come from `/api/prediction-markets` with a one-minute cache as the fallback. **Kalshi is our only market provider for now**; Polymarket was removed on Oct 10.
- Incumbent ideology scores, Gemini chat, the admin dashboard, and the researcher simulator.
- A provider-neutral election-results foundation. `/api/v1` results are served from the database read model (`RESULTS_READ_SOURCE=database`) and are currently backed only by fictional fixtures.
- Intel v2 database batch 1: `market_snapshots`, `indicator_series`, `indicator_observations`, `district_profiles`, and `agent_runs`.
- Hourly Kalshi snapshots: while the live feed is connected it writes one `market_snapshots` row per market per hour (`KALSHI_SNAPSHOTS_ENABLED`, on by default). Contest links are still null; rows carry state and district.
- Kalshi House coverage includes the per-district series (`HOUSEPA7-26`, `HOUSECA22-26`), where most competitive seats are listed. Before Oct 10 the catalog read only `KXHOUSERACE` and missed 65 races, including PA-07, AZ-06, CO-08, and NE-02.
- The map's prediction-markets panel follows the state, district, and office filters. With a state selected it shows that state's Senate race and every House race that has a market, closest first. At-large districts (`00`) work.
- Testing environment wiring (Oct 10): the frontend adds `https://` to a bare `VITE_API_URL`, CORS falls back to Railway's `RAILWAY_SERVICE_*_URL` when `FRONTEND_URL`/`ADMIN_URL` are unset, Express trusts Railway's proxy so rate limits are per visitor, and the public API limit is 600 requests per 15 minutes.
- Outside spending (FEC Schedule E, issue #31): a daily sync at 5:00 AM ET loads independent expenditures into `independent_expenditures` (recent 30 days re-fetched in full, older filings through a resumable weekly backfill). The Finance tab shows each candidate's spending for and against plus the race's top spenders, and candidate pages have an Outside Spending tab with totals, spenders, spending by medium, and recent filings. A 24/48-hour notice counts only until the same spending appears on the group's regular report, and support and opposition are never netted. Run `node dist/scripts/sync-outside-spending.js` once after deploy to start the backfill.
- Every displayed number carries its source and time: FEC figures show the date the latest report runs through, the sync date, and a link to the FEC.gov filings; Kalshi prices show the price type (midpoint or last trade) and when they last changed.
- Market history (Oct 14): `GET /api/prediction-markets/history?race=PA-07,PA-SEN&days=14` serves hourly Kalshi prices from `market_snapshots`. Race cards show a 14-day sparkline per outcome and the markets panel shows 7-day lines. Lines end at the live price, and hours with no stored price stay as breaks in the line.
- Biggest movers, Kalshi only (Oct 14): `GET /api/prediction-markets/movers?window=24h|7d&state=PA` and a "Biggest movers" card in the monitor's lower rail.
  - **Ranking rule (`backend/src/services/kalshi/history.ts`, `MOVERS_RULES`):** each market's newest stored hour (within 3 hours of the newest hour stored) is compared with its newest stored hour at or before the window start, at most 6 hours earlier than that.
  - **Quotes:** both prices must be bid/ask midpoints with a spread of 15 points or less.
  - **One row per race,** under the outcome that gained most. Races that moved less than 1 point are dropped.
  - **Exclusions are counted,** never treated as zero: a market with no baseline, or with a thin or last-trade-only quote, is counted as left out.
  - 7-day changes become available on Oct 17.
  - Flags: `MARKET_HISTORY_ENABLED` (backend), and `VITE_FEATURE_MARKET_HISTORY` and `VITE_FEATURE_MOVERS` (frontend). All are on by default.
  - The new migration adds a `(provider, captured_hour)` index on `market_snapshots`.
- Past results (Oct 14, section 4.9): a "2026 races | Past results" switch on the map.
  - **Coverage:** President 2000–2024 by state or county, winner or shift; Senate 1976–2024 by state; House 1976–2024, with districts coloured for 2024 only.
  - **Panel:** a "Past" detail tab.
  - **Data:** built from the MIT Election Lab CSVs as static JSON (`npm run build:past-results` in `CODE/`), not through a database table or API.
  - **Check:** national presidential totals match the official counts to within 0.02% in every year.
  - **Flag:** `VITE_FEATURE_PAST_RESULTS`, on by default.
- Midterm simulator (Oct 15): `/simulator/midterms`, a tab next to the electoral college simulator.
  - **Senate:** the 35 races on the 2026 ballot, rolled up from presidential county baselines, with the same swings, county edits, and calls as the electoral college map.
  - **House:** each district starts from its 2024 winner (or a tossup on a blank map) and is flipped by click.
  - **Control:** seat bars show each chamber (51 Senate seats, or 50 with the vice president's tiebreak; 218 House seats). King and Sanders count as Democrats, noted as independents who caucus with them.
  - The whole scenario is kept in the URL. Next step: impeachment vote math (section 4.10).
- Economic indicators from FRED (Oct 15, section 4.11): a row of 13 tiles under the chamber-control banner, with a compact copy in the expanded map's overlay.
  - **Data:** 21 FRED series in `indicator_series` and `indicator_observations`, synced at 9:15 AM and 6:15 PM ET (`npm run sync:fred` by hand).
  - **API:** `GET /api/indicators?days=730`, cached for 15 minutes.
  - **Restricted:** S&P 500 and VIX are stored but not served.
  - **Flags:** `ECON_INDICATORS_ENABLED` and `FRED_RESTRICTED_SERIES_ENABLED` (backend), and `VITE_FEATURE_ECONOMY` (frontend).
- State economic indicators and history charts (Oct 16, section 4.11): picking a state narrows the economy strip to that state, and every tile opens a history chart.
  - **Data:** 5 series for each of the 50 states and DC (255 in all: unemployment, payrolls, jobless claims, real GDP, home prices), plus `USSTHPI` nationally. Requests are paced to about 100 a minute, so a sync takes about 4 minutes.
  - **API:** `GET /api/indicators?state=CA` adds that state's series; `supported: false` for Puerto Rico.
  - **Strip:** with a state selected, 5 state tiles replace the national ones and the U.S.-only tiles are hidden; the U.S. figure is in each tooltip.
  - **Dialog:** 1Y / 2Y / 5Y history, with the U.S. on the same axis (rates, growth, home prices) or on a second chart (jobs, claims).
- Kalshi odds map (Oct 22): a "Market odds" mode next to "2026 races | Past results" on the map, with a U.S. Senate / U.S. House picker (`?mode=odds&ooffice=house`). Plan: `docs/plans/kalshi-odds-map.md`.
  - **Colours:** each Senate state or House district takes the colour of the outcome its live Kalshi market prices highest, from pale (under 60%) to saturated (90% and up), as on Kalshi's own maps. Independents have their own hue.
  - **Never 50/50:** no 2026 race, no open market, and no price yet each get their own grey; a tie at the top is gold.
  - **Flips:** hatching marks a race led by a different party than the member holding the seat today. A vacant seat is compared with its last holder, and an independent holder counts as neither party. Redistricted seats are never hatched.
  - **Seat holders:** `npm run build:seat-holders` (in `CODE/`) writes `public/data/seat-holders-2026.json` from the congress-legislators project. Rerun it after any special election, resignation, or party switch, then commit the output. A test checks the Senate races in `races2026.ts` against it; that check caught Oklahoma (Alan Armstrong was appointed to Markwayne Mullin's seat and is not running).
  - **Senate labels:** each state shows its leader's price; small Northeast states and DC are listed beside the national view.
  - **Redistricting:** districts in states listed in `redistricting-2026.json` keep the dashed amber outline, and the tooltip and legend warn that the shapes are 2024 lines while the colour is the 2026 market for that district number. As of Oct 22 the list is AL, CA, FL, LA, MO, NC, OH, TN, TX, and UT (AL and LA added by hand; see `CODE/public/geo/SOURCES.md`).
  - **Data:** the live SSE feed only, so no backend change. Labelled as market prices, with the price type and last change, never as forecasts.
  - **Flag:** `VITE_FEATURE_ODDS_MAP`, on by default.

**Not done yet (carried over from Oct 1–7)**

- District race pages with ACS demographics and partisan lean.
- Agent foundation: shared job runner, Zod output schemas, and `AgentRun` logging.

**Known gaps**

- **Production is not set up.** On Railway, the production backend has no public domain and the production frontend has no variables. Everything so far runs in the Testing environment. See section 5.3.
- No news source is connected. The NYT and AP integrations (section 4.6) have no code or keys in the repo or in Railway yet. Plan (Oct 26): ingest news through our Apify account first, then tag and pick top stories per race with Agents 1 and 10. See `docs/plans/news-agents.md`. Oct 28: cut to national top stories from the past 24 hours, storing only the published list (`news_stories`), because of database size.
- Polls (VoteHub, built Oct 28) need their own Railway Postgres service and `POLLS_DATABASE_URL` before they show. Setup is in `docs/plans/polling-data.md`.
- Testing's main database is nearly full (Oct 29). Everything except polls moves to the new `Third_database` service, with the old rows copied over, once two `Backend` variables change. Steps are in section 5.5.
- No live election-results provider is licensed. Election night depends on getting one; see section 6.
- District boundaries: `CODE/public/geo/cd119.topo.json` has to be built (`npm run build:geo`) and committed. See `CODE/public/geo/SOURCES.md`.
- The legacy frontend (`/classic`, `features/election-dashboard/*`, `react-simple-maps`, and the `VITE_FEATURE_NEW_FRONTEND` flag) is ready to be removed.

---

## 3. Plan to November 3

| When | Work |
|---|---|
| **Oct 8–14** | **Set up production on Railway first** (section 5.3). ~~Market history API and sparklines. Biggest movers feed.~~ (done Oct 14). NYT and AP news ingestion into `articles` (section 4.6). Agent foundation, then Agent 1 (news triage). DB batch 2. ~~FRED indicators if time allows.~~ |
| **Oct 15–21** | Agent 3 (why it moved), citing NYT and AP articles. Kalshi odds on the Candidates page. District race pages, with a news section. Win probability index and its methodology page. Agent 5 (daily brief). ~~FRED economic indicators (section 4.11).~~ (done Oct 15) Past results for president, with county shifts (section 4.9). Five-Minute Briefing (P01) for pilot races. Coverage and Corrections Desk minimum (P11). Chatbot Google sign-in and daily chat history (section 4.12). DB batch 3. |
| **Oct 22–24** | Tipping-point races. Agents 2 and 4. Agent 8 through the chatbot, with tools and simulator guidance (section 4.12). Early vote tracker. My Ballot kit (P02). Live coverage panel (section 4.7). Senate and House past results (section 4.9). **Feature freeze Oct 24.** |
| **Oct 25–30** | Election night mode. Agent 9. Agent 7 (data QA). DB batch 4 (`race_calls`), then a schema freeze. Load test on Railway at expected election-night traffic. Rehearse rollback and a provider outage. **Code freeze Oct 30.** |
| **Oct 31–Nov 2** | Monitoring and reviewed data corrections only. Final results-feed rehearsal. On-call schedule set. Look up each network's scheduled election-night YouTube stream and load the video IDs (section 4.7). |
| **Nov 3** | Election night. Scale the API up, keep the results ingestor at exactly one replica, and fall back to official state result links for any race whose feed is unhealthy. |
| **After Nov 3** | Agent 6 (candidate positions), polarization and democratic-institutions indexes, post-election product ideas (section 4.3), and Phase 2 (section 4.4). |

---

## 4. Product ideas

### 4.1 Intel v2 features (pre-election)

| Feature | What it is |
|---|---|
| **Demographics for selected areas** | Users select counties, House districts, or both on the map, and a Demographics tab shows population, citizens of voting age, age, race and ethnicity, income, poverty, education, unemployment, and housing from the ACS 5-year estimates. See section 4.5. |
| **District race pages** | Every House, Senate, and governor race on one page: candidates, the incumbent's record and ideology, partisan lean, 2024 presidential margin, ACS demographics, FEC cash on hand and receipts, odds history, a polling average or "No public polling," top local issues, and recent NYT and AP coverage of the race (section 4.6). |
| **Market history** | **Shipped Oct 14** (section 2). Volume and liquidity come later. |
| **Kalshi odds on the Candidates page** | Each candidate card shows that candidate's market price when Kalshi lists one. The live feed already carries candidate names, so this is a join on state, district, and name, with party as the fallback. |
| **Win probability index** | A published formula that blends market prices, the polling average, and fundamentals (lean, incumbency, money ratio). Versioned methodology, computed in code, and every input stored so a value can be recomputed. |
| **Economic indicators** | GDP, oil, gas, inflation, jobs, interest rates, Treasury yields, real income, and consumer sentiment from FRED, in a strip under the chamber-control odds. S&P 500 and VIX are ingested but not shown until their licensing is cleared. See section 4.11. |
| **Cost of living by state** | Gas prices for each state compared with the U.S. average, with 1-week, 1-month, and 1-year changes, plus tariff exposure (imported share of spending, extra tariffs paid, and trade-exposed job changes) for each state. See section 4.8. |
| **Past results** | **Shipped Oct 14** (section 4.9). A Past results mode on the map: winners for president (by state and county), Senate (by state), and House (by district) from MIT Election Lab files, plus county and state shifts between two presidential years. |
| **Biggest movers** | The races where odds, polls, or money moved most over 24 hours or 7 days, each linked to its "why it moved" explanation. **The Kalshi-only version shipped Oct 14** (section 2); it is the trigger Agent 3 needs. Still to do: polls and money, NYT and AP headlines on each row, then Agent 3's explanations. |
| **Tipping-point races** | A Monte Carlo simulation over win probabilities that finds the seats most likely to decide House and Senate control. It can start from Kalshi prices for the 415 House and 34 Senate races that have markets, then switch to the win probability index once that exists. Races without a market are labeled, not filled in. |
| **Early vote tracker** | Ballots returned by party registration, in states that publish the data. |
| **Election night live mode** | Results, called and uncalled counts, and live odds per race. Browsers poll every 15–30 seconds; Kalshi stays on SSE. |
| **Live coverage panel** | Election-night YouTube live streams from major networks (NBC News, CNN, and others) embedded in the dashboard, so users can watch coverage next to the map and odds. See section 4.7. |
| **Research chatbot** | A Claude assistant behind Google sign-in that answers from our stored data with sources, keeps the day's chats (reset nightly), and reads the simulator scenario to help users think through their predictions. See section 4.12. |

### 4.2 AI agents

Agents are the analyst layer, not the data layer. Each agent is a job made of a prompt, a Zod schema, and a database write. We are not using an agent framework.

| # | Agent | Output | Cadence |
|---|---|---|---|
| 1 | News triage | Tags each NYT and AP article (section 4.6) with races, candidates, issue, event type, and relevance | Every 15–30 min |
| 2 | District issues | Top issues per district, with sources | Daily |
| 3 | Why it moved | A cited explanation of a signal event, using tagged articles published before the move, or "no clear cause found" | Event-driven |
| 4 | Signal divergence | Races where odds, polls, and money disagree | Daily |
| 5 | Daily brief | Top stories, movers, and races to watch | Each morning |
| 6 | Candidate positions | Positions by issue with a quote and link (requires human review) | Weekly, after Nov 3 |
| 7 | Data QA | Flags duplicates, broken links, and odd prices | Each sync |
| 8 | Ask the race | Answers grounded only in stored data, with citations | On demand, through the chatbot (section 4.12) |
| 9 | Election night | Live race notes and call summaries | Nov 3 |
| 10 | Top stories | Up to 5 top stories per race and 10 nationally, chosen from tagged articles. Returns article IDs and fixed reason codes only, so it publishes without review. Plan: `docs/plans/news-agents.md` | When a race's shortlist changes, at most every 4 hours |

Rules:

1. Every claim cites a stored source. If there is no source, the agent returns "not found."
2. Agents never produce displayed numbers or index values.
3. Every run stores its model, prompt version, input hash, output, and token counts in `agent_runs`.
4. The UI marks AI content with an "AI summary" badge linked to its sources.
5. Anything about a named person goes to the admin review queue first. Tags and briefs can publish automatically.
6. Agents must not predict winners or rank news by ideology.
7. Use a cheap, fast model for triage and a stronger model for Agents 3, 5, and 8. Tag each article once.

### 4.3 Voter and research ideas

These are prioritized. P01, P02, and P11 are the only pre-election commitments. Everything else comes after Nov 3, unless it is already nearly finished.

| ID | Idea | The moment it creates | Priority |
|---|---|---|---|
| P01 | **Five-Minute Election Briefing** | A race becomes a short, sourced story | P0, pilot races before the election |
| P02 | **My Ballot and Readiness Kit** | Address or district lookup, then a private checklist, a print view, and links to official voting resources | P0, before the election |
| P11 | **Coverage and Corrections Desk** | Editors see what voters can't safely rely on yet, and corrections reach the public UI | P0, foundation |
| P03 | **Evidence Lens and Issue Compare** | Every comparison cell opens its evidence | P1, a few reviewed topics |
| P04 | **Money Trail Stories** | Explains where reported campaign money comes from, without implying influence | P1, after finance validation |
| P05 | **Since Your Last Visit** | Shows only the meaningful changes, including corrections | P1 |
| P07 | **Office Powers Explorer** | What this office can actually do | P1, low-data |
| P08 | **Portable Civic Guide** | Print, offline, and shareable cards that keep their sources | P1 |
| P06 | **Ask With Receipts** | Chat answers with inspectable supporting passages (merges with Agent 8; delivered by section 4.12) | P2, controlled beta |
| P09 | **Reproducible Scenario Studio** | Save, compare, and explain a "what if turnout shifts 3 points" scenario | P2, research release |
| P10 | **Civic Publisher Kit** | Libraries and newsrooms embed a maintained guide | P2, partner pilot |
| P12 | **Promise-to-Action Ledger** | Follow a representative's documented actions after the election | P2, post-election |

Shared requirements for all of these:

- Every claim records its source, date, review state, and revision.
- Corrections create new revisions and never overwrite history.
- Candidates are ordered consistently, for example alphabetically.
- WCAG 2.2 AA is the target.
- p75 LCP is at most 2.5 seconds on mobile, and p95 for our own read APIs is at most 750 ms.
- Every module can be turned off with a feature flag.

**North-star metric:** weekly informed-action sessions. These are anonymous sessions that read a briefing, comparison, or evidence block, and then open an official voting resource or create a readiness guide.

### 4.4 After the election

- **Indexes, each with a published methodology:** a polarization index (DW-NOMINATE gap, party-line votes, affective polarization, split-ticket districts) and a democratic-institutions tracker (V-Dem, Freedom House, Bright Line Watch).
- **Phase 2: Elections Monitor.** 2027 governor races, the 2028 primaries, and a global calendar of major foreign elections. We are not expanding into general geopolitics.
- **Business model:** core voter information stays free. Institutional embeds and research exports come only after we validate partner demand. We will never monetize vote intentions or reading profiles.

### 4.5 Demographics (ACS 5-year)

- **Source.** Census Data API, ACS 5-year detailed tables (2020–2024 vintage, `CENSUS_ACS_YEAR`). `npm run sync:acs` loads the nation, states, counties, 119th Congress districts, and the county pieces inside each district into `area_demographics`, and fills `district_profiles`. ACS publishes once a year, so the sync is run by hand after each December release.
- **Selection.** Nothing selected: the whole state, compared with the US. Counties only: the counties combined. Districts only: the districts combined. Both: the **overlap**, meaning only the parts of the selected counties that lie inside the selected districts, with each piece listed.
- **Math in code.** Only counts are stored. Sums use root-sum-of-squares margins of error, shares use the Census proportion formula, and a combined median household income is interpolated from income brackets and labeled "estimated." Values with a coefficient of variation over 30% are flagged. Census "not available" codes become null, never 0.
- **Known gaps.** States with new 2026 maps show figures for their 2024 lines, like the map outlines. Connecticut's ACS geography is its 9 planning regions, so the county layer needs 2024 Census county boundaries (`npm run build:geo:counties`).
- **Nonpartisan.** Demographics are shown as facts about an area, never as a prediction of how it votes.

### 4.6 News: New York Times and AP

**Oct 26: Apify comes first.** Google News search results through our Apify account ($205 of credits) feed the same `articles` table, with tiered per-race searches, spend caps, and Agents 1 and 10. See `docs/plans/news-agents.md`. NYT and AP become additional sources once licensed, and the rules below apply to every source.

NYT and AP articles are the source material for news on race pages and for Agents 1, 3, and 5. **Neither is built yet.** There is no client code, and no `NYT_*` or `AP_*` keys exist in the repo or in Railway.

| Source | APIs to use | What we store and show |
|---|---|---|
| **New York Times** | Times Newswire for new U.S. and politics articles, polled every 15 minutes. Article Search for targeted lookups by candidate or race, queued to stay under its limits (about 5 requests per minute and 500 per day; confirm on the developer portal). | Headline, abstract, byline, section, publish time, and the nytimes.com link. The API does not return full text, and we do not scrape it. Show the attribution line the NYT terms require. |
| **AP** | AP Media API (news content), filtered to U.S. politics and elections. | Headline, summary, publish time, and the apnews.com link, unless the AP contract allows more. Confirm the display and storage rights before shipping. |

**Pipeline**

1. A `cron-news` Railway cron service runs every 15 minutes. It never runs inside an `api` replica.
2. Each raw response is saved as a `RawArtifact`. Articles are upserted into `articles`, unique on (source, external ID), with `source`, `url`, `headline`, `abstract`, `byline`, `section`, `published_at`, and `fetched_at`.
3. Agent 1 tags each new article with races and candidates in `article_tags`. Tags can publish automatically. Anything summarizing a named person goes to review first (section 4.2, rule 5).
4. Readers use `article_tags`, never the raw feeds: race pages, the Candidates page ("In the news"), Biggest movers, Agent 3, and Agent 5.

**Rules**

- Link out to the publisher. Show the outlet name and publish time on every item.
- Treat both sources the same. Never rank, filter, or label coverage by outlet ideology.
- AI text that uses an article cites its link. Article text is never a source for displayed numbers.
- Missing coverage shows as "No recent NYT or AP coverage," not as an empty box.
- Gate it with `NEWS_INGEST_ENABLED` (backend) and a `VITE_FEATURE_NEWS` flag (frontend).

**To confirm before building**

- Does our AP account cover only news content, or also the **AP Elections API**? If it covers elections, AP becomes the election-night results provider in section 6, and the "not licensed yet" gap closes.
- Which NYT APIs our key is enabled for, and the NYT and AP terms on caching headlines and abstracts.

### 4.7 Live coverage: network election-night streams

Embed election-night YouTube live streams from major news outlets in the dashboard, so users can watch the broadcast next to the map, results, and odds.

**Outlets.** Start with a balanced set across the spectrum, shown in alphabetical order with no "recommended" pick:

| Outlet | Where its stream lives | To confirm |
|---|---|---|
| ABC News | ABC News Live on YouTube | Whether election coverage is embeddable |
| CBS News | CBS News 24/7 on YouTube | Same |
| CNN | CNN does not usually stream its TV feed free on YouTube | Whether a YouTube stream exists; otherwise a "Watch on CNN" link-out tile |
| Fox News / LiveNOW from FOX | LiveNOW from FOX on YouTube; Fox News itself is mostly behind a TV login | Which channel carries election night |
| NBC News | NBC News NOW on YouTube | Whether election coverage is embeddable |
| PBS NewsHour | PBS NewsHour on YouTube | Same |
| Reuters, Bloomberg, C-SPAN, NewsNation, Decision Desk HQ | Their YouTube channels | Optional extras if they stream |

**How it works**

1. **Day-of configuration, not code.** Networks create election-night streams shortly before they air, so video IDs are not known in advance. The API serves the stream list (`GET /api/live-streams`) from the database, and admins set each outlet's video ID, or its channel's live URL as a fallback, in the admin dashboard. Changing a `VITE_*` value would need a rebuild of `web`, which is too slow on election night.
2. **Official YouTube player only.** Embed with the YouTube IFrame player from `youtube-nocookie.com`. Never re-stream, record, proxy, or clip the video. Add `frame-src https://www.youtube-nocookie.com` to the `web` Content Security Policy.
3. **Click to load.** Each tile shows the outlet name and a "Watch live" button. The iframe loads only after the click, so YouTube sets no cookies and loads no video for users who don't watch. That keeps the privacy rule (section 1) and the page-speed budget.
4. **One with sound.** Allow up to four players in a grid, but only one unmuted at a time.
5. **Graceful fallback.** If a stream is offline, ended, or has embedding disabled, the tile shows "Not streaming right now" and a "Watch on YouTube" (or outlet site) link, never a broken player.

**Rules**

- **Network calls are the network's.** Label the panel "Third-party broadcasts. Race calls and numbers in the video are the network's, not VoteInformed's." Never copy a call from a stream into `race_calls` or the results read model.
- **Treat every outlet the same.** Same tile size, alphabetical order, and no ranking or labeling by ideology.
- **Placement.** A "Live coverage" card on the dashboard during election-night mode, collapsed by default on mobile. Gate it with `VITE_FEATURE_LIVE_STREAMS`, plus a backend switch so admins can hide the panel without a deploy.

**To confirm before building**

- Each outlet's election-night YouTube plans, and that its streams allow embedding.
- YouTube's embedding terms for live content, and whether any outlet requires attribution beyond the player's own branding.

### 4.8 Cost of living: gas prices and tariff exposure by state

A **Cost of Living** tab on the map, next to Demographics, with two panels: gas prices and tariff exposure. Selecting a state shows that state compared with the U.S. average. No state selected shows a 50-state map and a ranked table. Like demographics (section 4.5), these are facts about a place. They are never presented as a prediction or explanation of how it votes.

**Gas prices**

| Source | What it gives | Coverage | Cadence and access |
|---|---|---|---|
| **EIA weekly retail prices** (primary) | Regular, midgrade, premium, and diesel, in dollars per gallon | U.S.; 9 states (CA, CO, FL, MA, MN, NY, OH, TX, WA); PADD regions 1–5 with subregions 1A, 1B, and 1C; 10 cities | Every Monday, released Tuesday. Free EIA API v2, route `petroleum/pri/gnd` (U.S. regular is series `EMM_EPMR_PTE_NUS_DPG`). Public domain. History goes back to the 1990s. |
| **AAA daily state averages** | Regular, midgrade, premium, and diesel for all 50 states, DC, and metros | Every state | Daily. There is no public API, and the data comes from OPIS. **Needs a license; we do not scrape it.** |
| **GasBuddy business API** or **OPIS** | Daily state, metro, and county prices | Every state and many counties | Paid. Use one only if we license it. |
| **EIA SEDS** | Annual average motor gasoline price for every state | All 50 states and DC | Annual, about two years behind. Good for long-run context only. |
| **BLS CPI gasoline index** (`CUUR0000SETB01` and regional and metro versions) | Gasoline price change as an index | U.S., 4 census regions, and about 20 metro areas | Monthly, from the BLS API. |
| **American Petroleum Institute state gas tax report** | State excise and other taxes in cents per gallon | All states | Quarterly. It explains part of why states differ, for example California's taxes and fuel blend. |

Example from EIA, regular gasoline, week of Oct 5, 2026 compared with the week of Sep 29, 2025 (pulled Oct 11):

| Area | Price now | Year ago | Change |
|---|---|---|---|
| U.S. | $4.354 | $3.118 | +$1.24 (+39.6%) |
| California | $6.227 | $4.446 | +$1.78 (+40.1%) |
| Texas | $3.874 | $2.647 | +$1.23 (+46.4%) |
| Ohio | $3.829 | $2.856 | +$0.97 (+34.1%) |
| Washington | $5.424 | $4.449 | +$0.98 (+21.9%) |

What to show:

- **Price now** compared with the U.S. average, as dollars above or below it and as a rank.
- **Change over fixed windows:** 1 week, 1 month, 1 year, and an optional date the user picks. We do not pick a baseline tied to a person or party (an inauguration day, for example). The windows are the same for every state.
- **A 2-year line chart** of the state against the U.S., plus an inflation-adjusted toggle that deflates the price by CPI excluding energy.
- **Coverage label.** Ship the EIA version first. For the 41 states EIA does not publish, show the state's PADD region price, labeled "Regional average (East Coast, PADD 1), not a state figure." It is never shown as the state's own price. If we license AAA or GasBuddy, that becomes the state source and EIA stays as the national reference.
- **"Country" means the U.S. average.** No free source gives county prices. County gas prices are possible only through a paid GasBuddy or OPIS license.

**Tariff exposure**

No single neutral "tariff index" covers every state, so we show several measures, each with its own source and method. We never combine them into a score.

| Measure | Source | What it says | Geography and timing | Access |
|---|---|---|---|---|
| **Imported share of consumer spending** | Federal Reserve FEDS Note, "Which states are most exposed to tariff increases?" (Heyman, Hottman, and Monarch, Sep 3, 2026) | The share of a state's household spending that goes to directly imported consumer goods. Highest: CA 13.8% and NJ 12.7%. Lowest: NE and MO, both 2.6%. The population-weighted average is 7.1%. A 10-point tariff passed through fully raises living costs by about 1.4% in CA, 0.8% in PA, and 0.3% in NE. | **31 states only** (the Consumer Expenditure Survey sample). 2023 data. Counts only direct imports, so it understates exposure. | Published figure and accessible data table. Load it once as a static dataset. |
| **Extra tariffs paid on imports** | NTUF State Tariffs Tracker (tariffs.org), estimates by Trade Partnership Worldwide | Cumulative executive-action tariffs since January 2025. Top totals: CA $63B, TX $37B, MI $23B, GA $20B, IL $17B. Top per household: MI $5,619, GA $4,771, CA $4,552, SC $4,203, NJ $4,031. Also gives monthly series and the hardest-hit import categories. | All 50 states, DC, and PR. Quarterly, through 2026 Q2 (updated Aug 4, 2026). | Free JSON (`tariffs.org/data/current.json`, `/data/states/<slug>.json`), free to use with attribution. Read the `/terms/` page before shipping. NTUF is a taxpayer advocacy group, so label the publisher and link its methodology. |
| **Imports by state and country** (build our own) | Census International Trade API, `timeseries/intltrade/imports/statehs` and `exports/statehs` | Monthly import and export value by state, HS code (2, 4, or 6 digit), and partner country (`CTY_CODE`). From this we compute imports from China, Canada, Mexico, and the EU as a share of state GDP (BEA), and exports to countries that placed retaliatory tariffs on U.S. goods. | All states, monthly, about a 5-week lag. Note: `STATE` is the state of destination on customs filings, not where goods are consumed, and `XX` means unidentified. | Free; uses our existing `CENSUS_API_KEY`. |
| **Manufacturing and trade-exposed jobs** | BLS QCEW (county and state, quarterly, about a 5-month lag), BLS CES state employment (monthly), BLS LAUS unemployment (monthly) | Year-over-year change in manufacturing (NAICS 31–33) and other trade-exposed industries (agriculture, transportation equipment, primary metals), as a count and percent. QCEW also has **county** detail, which fits the map's county layer. | All states and counties | Free BLS API (`BLS_API_KEY` for higher limits). |
| **Announced layoffs** | State WARN Act notices (each state's labor department); aggregators such as WarnFirehose | Mass layoff and plant-closure notices with employer, location, headcount, and date | All states, but each state publishes differently | Prefer the state sources. Aggregators are a cross-check only. WARN notices do not give a reason, so we never label one "tariff-related." |
| **National context** | Yale Budget Lab "Tracking the Economic Effects of Tariffs"; CBO tariff projections (Jul 31, 2026); CRS R49481 (tariff actions in effect, Sep 30, 2026); Tax Foundation tariff tracker | Effective tariff rate (Yale: 9.1% after the Supreme Court ruling), average household cost, revenue, and which tariffs are in force | National only | Cite and link. Use these for the methodology page and the U.S. comparison row, not as state values. |

What to show:

- **Exposure, not blame.** Each panel says what it measures, for example "Estimated extra tariffs paid on goods imported into Michigan, Q1 2025 to Q2 2026." Job losses and tariff exposure appear side by side but are **never presented as cause and effect**. Show this note: "Job changes have many causes; this does not isolate the effect of tariffs."
- **Per household and per capita** next to totals, so large states do not top every ranking simply because they are large.
- **Missing is not zero.** The 19 states without a Fed figure show "Not in the Fed study (31-state sample)." A suppressed QCEW cell shows "Suppressed by BLS," not 0.
- **Source line on every number:** publisher, data period, and fetch date, as on FEC and Kalshi figures.
- **Avoid advocacy and campaign sources** (party committee fact sheets, sites such as wepaythetariffs.com, and unsourced "tariff calculators"). If a partisan or advocacy group is the only source for a figure, we do not show that figure.

**Build**

1. **Data model (additive).** Reuse `indicator_series` and `indicator_observations` (batch 1). Add nullable `geo_level` (`nation`, `padd`, `state`, `county`, `metro`) and `geo_code` to `indicator_series` with a unique key on (`key`, `geo_code`). Series keys look like `eia.gas.regular`, `bls.qcew.mfg.employment`, and `ntuf.tariffs.exec_total`. The tariff-category breakdown and the Fed's one-off table go in `area_metrics` (state code, metric, period, value, source), or into `indicator_observations` if that fits.
2. **Jobs.** `cron-econ`, a Railway cron job that runs EIA weekly (Tuesday after release), BLS monthly, Census trade monthly, and NTUF quarterly. Each raw response is saved as a `RawArtifact`, and `SyncLease` prevents overlaps. This is the same job as the FRED ingestion in section 4.11, extended.
3. **API.** `GET /api/cost-of-living?state=MI` returns the gas price and change windows, tariff measures, job changes, and sources. `GET /api/cost-of-living/rankings?metric=gas.change_1y` returns the 50-state table.
4. **Frontend.** The Cost of Living tab with a state choropleth, a comparison table, and a chart. Gate it with `VITE_FEATURE_COST_OF_LIVING` and `COST_OF_LIVING_INGEST_ENABLED`.
5. **Timing.** EIA gas prices and the NTUF tariff data are small and free, so they can ship before the Oct 24 feature freeze if there is time. The Census trade, QCEW, and WARN builds come after Nov 3.

**To confirm before building**

- The EIA API key (free) and BLS API key (free) are added to Railway.
- The tariffs.org Terms of Use allow display on our site, not only journalist citation.
- The Fed note's accessible table lists all 31 state values. If not, contact the authors before using it.
- Whether we want to pay for AAA, GasBuddy, or OPIS data to get daily prices for all 50 states (and counties). Without it, 41 states show a regional figure.

**Sources and research links** (checked Oct 11, 2026)

Gas prices:

- [EIA gasoline and diesel fuel update](https://www.eia.gov/petroleum/gasdiesel/): weekly prices, geography list, and full-history XLS files
- [EIA FAQ: historical gasoline prices by state](https://www.eia.gov/tools/faqs/faq.php?id=26&t=10)
- [EIA Open Data (API v2)](https://www.eia.gov/opendata/)
- [AAA state gas price averages](https://gasprices.aaa.com/?state=US): reference only; needs a license to use

Tariff exposure:

- [Federal Reserve FEDS Note: "Which states are most exposed to tariff increases?"](https://www.federalreserve.gov/econres/notes/feds-notes/which-states-are-most-exposed-to-tariff-increases-a-new-measure-based-on-the-consumption-channel-20260903.html) (Sep 3, 2026)
- [NTUF State Tariffs Tracker: rankings](https://tariffs.org/rankings/), [methodology](https://tariffs.org/methodology/), and [data](https://tariffs.org/data/)
- [Trade Partnership Worldwide: State Tariff Tracker](https://tradepartnership.com/data/the-state-tariff-tracker/): commercial; the source behind the NTUF estimates
- [Census API: imports by state and HS code](https://api.census.gov/data/timeseries/intltrade/imports/statehs) and [catalog entry](https://catalog.data.gov/dataset/time-series-international-trade-monthly-u-s-imports-by-state-and-harmonized-system-hs-code)
- [Census API: exports by state and HS code](https://api.census.gov/data/timeseries/intltrade/exports/statehs)

Jobs and layoffs:

- [BLS QCEW state and county map](https://data.bls.gov/maps/cew/US)
- [WarnFirehose US Layoff Tracker](https://www.warnfirehose.com/layoffs): WARN aggregator, used only to cross-check the states' own lists

National context:

- [Yale Budget Lab: Tracking the Economic Effects of Tariffs](https://budgetlab.yale.edu/research/tracking-economic-effects-tariffs)
- [CBO: Updated Budgetary Projections of Tariffs as of July 31, 2026](https://www.cbo.gov/publication/62704)
- [CRS R49481: Active Presidential Tariff Actions in 2026](https://www.everycrsreport.com/reports/R49481.html)
- [Tax Foundation: Trump Tariffs Tracker](https://taxfoundation.org/research/all/federal/trump-tariffs-trade-war/)

### 4.9 Past results: MIT Election Lab presidential, Senate, and House returns

A **Past results** mode for the map that shows how places voted before, using the MIT Election Data + Science Lab (MEDSL) CSV files we load. It covers three offices:

| Office | MEDSL file (Harvard Dataverse) | Geography | Map layer it colors |
|---|---|---|---|
| **President** | County Presidential Election Returns 2000–2024 (`countypres_2000-2024.csv`) | County, rolled up to state | Counties and states |
| **U.S. Senate** | U.S. Senate Statewide 1976–2024 (`1976-2024-senate.csv`) | State | States |
| **U.S. House** | U.S. House 1976–2024 (`1976-2024-house.csv`) | Congressional district | Districts |

The Senate and House files are statewide and district-wide totals, **not county results**. County-level Senate and House results exist only in MEDSL's precinct files and are out of scope for this section.

**What the map shows**

The map's top bar gets a toggle: **2026 races | Past results**. In Past results, the user picks an office (President, Senate, House), a year, and a view:

1. **Winner.** Each state, district, or county is colored by the party that won it. The shade shows the margin, in the same bins for both parties: under 1, 1–5, 5–10, 10–20, and 20+ points. Democrats are blue, Republicans red, and independents and third parties a neutral third color. Independents are never colored or labeled as a party they caucus with, for example King or Sanders.
2. **Shift (president only).** Each county and state is colored by how far the margin moved between two presidential years the user picks, for example 2020 → 2024. The default is the two most recent elections. A diverging scale shows the direction and size of the move toward either party. Selecting a county shows the shift for each party separately: Democratic share, Republican share, and other share in each year, the change in points, and the change in total votes.
3. **Details on select.** Selecting a state, district, or county opens a Past results tab in the detail panel. It shows every candidate's votes and share for the chosen year, plus a table and small line chart of the presidential margin for every year from 2000 to 2024. For Senate it shows both seats' most recent races, and for the House the district's races.

We recommend **a mode inside the existing map**, not a second map. The map already loads the state, district, and county shapes and handles hover and selection. A second MapLibre instance would double memory use on phones. A side-by-side view comparing two years can come after Nov 3 if people want it.

**Rules**

- **History is not a forecast.** Label the mode "Past results (MIT Election Lab), not 2026 results or predictions." Past results are never written into the `/api/v1` results read model or shown in election-night mode, so they can never pass for live counts.
- **Same treatment for both parties.** Use the same bins, legend, and wording either way: "shifted 4.2 points toward Republicans" and "shifted 4.2 points toward Democrats." Do not use words like "surge" or "collapse."
- **Define the math.** Shares are a share of **all** votes cast for the office in that place, including third parties and write-ins. Margin is Democratic share minus Republican share. Shift is margin in the later year minus margin in the earlier year, in points. Say this in the legend's "How this is calculated" link. A two-party-share toggle can come later.
- **Missing is not zero.** "No Senate race in 2022" (most states hold one in only two of every three cycles), "Unopposed: no vote count reported" (several states, Florida among them, do not report unopposed House races), "Not reported by county" (Alaska reports by state house district), and "Boundaries changed; not comparable" each get their own grey and legend entry.
- **House districts only for matching lines.** District lines change after each census and, in several states, mid-decade. The map colors House districts only for the year whose lines match the shapes we draw (`cd119`, used in 2024). Other years and redistricted states (section 2, `redistricting-2026.json`) show a list, not a colored map.
- **Source line** on every panel: "MIT Election Data + Science Lab, [dataset name], Harvard Dataverse, version [file version], loaded [date]." Link the dataset's DOI page.
- **Accessible.** Color is never the only cue. The tooltip and panel always state the winner and margin in words, and the legend works with a keyboard and a screen reader.

**Data problems the import must handle**

| File | Problem | Handling |
|---|---|---|
| County president | Some states report each county's votes split by vote method (`mode` = ABSENTEE, ELECTION DAY, EARLY, PROVISIONAL), with or without a `TOTAL` row | Use the `TOTAL` row when present; otherwise add up the mode rows per county and candidate |
| County president | Rows with no county FIPS (overseas, federal precinct, statewide write-ins) | Exclude them from county results but **include** them in the state total |
| County president | Alaska's units are state house districts; some cities report separately from their counties, for example Kansas City, Missouri | Keep them in state totals. Show the Alaska and city note on the county layer. The import lists every FIPS code that has no matching shape on the map |
| County president | Boundary changes: Connecticut's switch to 9 planning regions (2022), Alaska's Valdez-Cordova split (2019) | A shift is computed only when the same FIPS code exists in both years; otherwise "Boundaries changed; not comparable" |
| House | At-large districts are `0`; fusion tickets (New York, Connecticut) list one candidate several times under different parties | Store at-large as `00`, matching the rest of the app. Add up each candidate's votes across fusion lines and credit them to their main party, keeping the party lines in the details |
| House and Senate | Specials, runoffs (`stage`, `special`, `runoff`), write-ins, and `unofficial` flags | Keep each race separate. The map uses the regular general election and offers specials and runoffs in the panel. Georgia's runoffs are shown as runoffs |
| Senate | Ranked-choice states (Maine, Alaska) | MEDSL reports the first round; label it "First-round votes" |
| All | Party names vary by year and state | Store MEDSL's simplified party for colors and its detailed party for display |

**As built (Oct 14).** We shipped a simpler version than the plan below.

- **Static files, not a database.** `CODE/scripts/build-past-results.mjs` converts the three CSVs into static JSON in `CODE/public/data/past-results/`, and the map reads those files directly.
  - That skips the `historical_results` table, the importer rewrite, and the `/api/history/*` endpoints.
  - The data changes only when MEDSL publishes a new release, so static files cached by the browser fit it.
  - **To update:** follow `backend/data/medsl/README.md`.
- **Clean-up rules.** The script applies the rules in the table above, plus the following, which turned up in the actual files:
  - 2024 rows labelled `TOTAL VOTES CAST`, `OVERVOTES`, and `UNDERVOTES` are not candidates.
  - Some 2024 states list a partial vote-method breakdown next to their `TOTAL` rows; the `TOTAL` row wins.
  - Kansas City, MO reports separately (FIPS `2938000`, and `36000` in 2024); its votes are added to Jackson County.
  - Oglala Lakota County, SD's old code `46113` maps to `46102`.
  - Georgia's 1992 and 2008 Senate rows label the November round `pre` and the runoff `gen`.
  - Georgia's January 2021 runoffs are filed under the 2020 cycle.
  - Texas's court-ordered 1996 House elections are coded as primaries; they are treated as open specials.
  - House unopposed races are marked with `totalvotes` of 1 or -1.
  - House parties are simplified to D, R, or other; DFL and Democratic-NPL count as D.
- **Map colouring.**
  - The map colours by the race that decided the seat: the regular election, or its runoff when one was held. Specials are listed in the panel. For example, Georgia 2020 shows Ossoff.
  - Connecticut's county shift works because both the data and the us-atlas county shapes use its old counties. That will break if `county2024.topo.json`, with planning regions, is built.
- **Not built yet:**
  - the database tables (needed only if Ask the race or other agents need past results)
  - the "both seats' most recent races" Senate history
  - the import fixtures and tests

**Original plan (superseded where it conflicts with the above)**

What exists: `backend/src/scripts/import-mit-results.ts` (`npm run import:county-results`), `seed-counties.ts`, and the `County` and `CountyResult` models, which feed the researcher simulator. The simulator's routes (`/api/research/*`) require a researcher login, so the public map cannot use them. The importer has problems that matter here:

- It handles only `HOUSE` and `SENATE`, and it expects a `county_fips` column. MEDSL's standard House and Senate files have no county column, so the importer cannot load them. Its header also mislabels `countypres_*` (the presidential file) as House data.
- It upserts one row per candidate, so a county reported in several vote-method rows **keeps only the last one** instead of adding them up. Totals for those states come out wrong.
- At-large district `0` is stripped to an empty string and then defaults to `1`.
- Rows with no FIPS are dropped, so state totals rolled up from counties come out short.
- It upserts one row at a time and then recomputes percentages one county at a time. The 2000–2024 presidential file has over 70,000 rows, so this means tens of thousands of database round trips.
- It does not record a `DataSource`, `IngestionRun`, or `RawArtifact`.

Planned changes:

1. **Data model (additive migration, batch 3).**
   - `CountyResult`: allow `officeType = 'PRESIDENT'`, and add nullable `party_detailed`, `total_votes` (`BIGINT`, the county's total for the office, from MEDSL's `totalvotes`), and `ingestion_run_id`. Existing House and Senate rows and the simulator keep working.
   - New `historical_results` table for statewide and district-wide returns: `office` (`PRESIDENT`, `SENATE`, `HOUSE`), `cycle`, `state`, `district` (`00` at-large, empty string statewide), `stage` (`GEN`, `RUNOFF`), `special`, `candidate`, `party_simplified`, `party_detailed`, `writein`, `votes` and `total_votes` (`BIGINT`), `unofficial`, `source_version`, and `ingestion_run_id`. Unique on (office, cycle, state, district, stage, special, candidate). The state presidential totals go here too, rolled up during import from the county file **including** the no-FIPS rows.
   - One `DataSource` row per MEDSL dataset, with the DOI, version, and attribution text.
2. **Importer.** Replace `import-mit-results.ts` with `import-medsl.ts` (`npm run import:medsl -- --dataset=president-county|senate|house --file=<csv> [--from=2000]`):
   - Read the whole CSV, check the headers it expects, add up mode rows and fusion lines in memory, then write each cycle in one transaction (delete that cycle's rows for the dataset, then `createMany`). Re-running the same file gives the same result.
   - Hash the file and save it as a `RawArtifact` (a Railway Bucket once that exists), and record an `IngestionRun` with row counts.
   - Print a check report: rows read, rows skipped by reason, FIPS codes with no map shape, and for each state and year whether the county sum matches MEDSL's state total. Large mismatches stop the import.
   - Keep `--office=HOUSE|SENATE` county mode working for the simulator's precinct-derived files, or move the simulator to the new tables.
3. **Service and API** (`backend/src/services/history.service.ts`, `backend/src/routes/history.routes.ts`, public, Zod-validated, read-only):
   - `GET /api/history/results?office=PRESIDENT&cycle=2024&level=state|county|district[&state=PA]` returns compact rows: `{ code, winnerParty, demPct, repPct, otherPct, margin, totalVotes, status }`, where `status` is `ok`, `no_race`, `unopposed`, or `not_reported`.
   - `GET /api/history/shift?from=2020&to=2024&level=county|state[&state=PA]` returns `{ code, marginShift, demShift, repShift, otherShift, turnoutChangePct, comparable }`.
   - `GET /api/history/area/:level/:code` returns the panel details: candidates per year and the presidential margin series.
   - The data changes only when we import, so send long `Cache-Control` headers with an `ETag` built from the latest `IngestionRun` ID. The full county payload is about 3,100 rows (around 150 KB gzipped), small enough to fetch once per office and year.
   - Add `GET /api/history/meta` (the years available for each office, plus the source and version) so the year pickers never offer a year we don't have.
4. **Frontend** (`CODE/src/features/election-monitor/`):
   - `types.ts` and `useMonitorParams.ts`: add `view=history`, `hoffice`, `cycle`, `from`, and `metric=winner|shift` URL params, so a view can be linked to.
   - `map/ElectionMap.tsx`: in history mode, set feature-state values (`margin`, `shift`, `status`) on the existing `states`, `counties`, and `districts` sources, and swap the fill-color expressions for diverging margin and shift scales. Readiness colors come back when the user returns to 2026 races. No new geometry is needed: the county layer already uses the Census 2024 shapes (`county2024.topo.json`), with the 2017 us-atlas shapes as a fallback.
   - New `HistoryControls.tsx` (office, year, and from-year pickers plus the view switch), `HistoryLegend.tsx` (bins, grey states, how it is calculated, source line), and `PastResultsTab.tsx` in `DetailPanel` (add `"history"` to `DetailTab`).
   - New `history.ts` with TanStack Query hooks; `staleTime: Infinity`, since the data only changes when we import.
   - Gate it with `VITE_FEATURE_PAST_RESULTS`, plus `HISTORY_API_ENABLED` on the backend.
5. **Tests.** Import fixtures for each problem in the table above: mode rows with and without a total, no-FIPS rows, at-large districts, fusion tickets, specials and runoffs, and an unopposed race. Also unit tests for margin and shift math, and an API contract test. Add them to `npm run test:results` or a new `test:history`.
6. **Loading the files.** The CSVs are not committed. Put them in `backend/data/medsl/` (gitignored), run the import against Testing with `railway run`, check the report, then run it against production. Write the steps into `backend/data/medsl/README.md`.

**Timing.** The data is static and free, and the map work reuses existing layers. President (county and state winner, plus shift) can ship by Oct 21. Senate and House winner layers can ship by the Oct 24 feature freeze. Arrow-style shift markers (an arrow on each county sized by its shift) and the side-by-side comparison come after Nov 3.

**To confirm before building**

- Which CSV files and versions you are providing. The column names above follow MEDSL's current releases. If a file differs, the importer's header check will say so.
- The license on each Dataverse dataset. MEDSL data is generally CC0, but check each one, keep the attribution line, and follow MEDSL's citation request.
- Whether the 2024 county file uses Connecticut's planning regions or its old counties. This decides whether Connecticut can show a 2020 → 2024 shift.
- Whether the simulator should move to the new tables or keep its own House and Senate county rows.

**Sources**

- [MEDSL data portal](https://electionlab.mit.edu/data)
- [County Presidential Election Returns 2000–2024](https://doi.org/10.7910/DVN/VOQCHQ) (Harvard Dataverse)
- [U.S. Senate Statewide 1976–2024](https://doi.org/10.7910/DVN/PEJ5QU) (Harvard Dataverse)
- [U.S. House 1976–2024](https://doi.org/10.7910/DVN/IG0UN2) (Harvard Dataverse)

### 4.10 Simulator: impeachment and removal math

A card on the midterm simulator (`/simulator/midterms`) that answers, for the simulated 120th Congress (seated Jan 3, 2027; President Trump's term ends Jan 20, 2029): could this House impeach, could this Senate convict, and how many cross-party votes would each step need? **The exact formula is still to be agreed.** What follows are suggestions.

This is **constitutional vote math, not a judgment on the merits.** Section 1 rules out "likelihood of" indexes about people and parties, and says numbers come from code. So every number here comes from the simulator, roll-call history, or a labeled market price, never from AI.

**The thresholds**

- **House impeachment:** a simple majority of members voting, which is **218** when all 435 vote.
- **Senate conviction:** two-thirds of senators present, which is **67** of 100.
- **Removal** needs both.

**Layer 1: vote math (deterministic; ship first)**

Computed straight from the simulator's totals (`simulateHouse` and `simulateSenate` in `CODE/src/features/simulator/midterms/model.ts`):

- **House:** the opposing party's seats against 218, shown as "N votes short" or "N to spare" on a party-line vote.
- **Senate:** `67 − (Democrats + independents who caucus with them)` is the number of Republican votes needed to convict. With the 2024 baseline (46 Democratic seats), that is 21.
- **Display:** a card under the seat bars that updates as the user edits the map. No probability is shown at this layer.

**Layer 2: probability (suggested formula)**

`P(impeached) = Σ over House outcomes of P(House outcome) × P(articles pass | House outcome)`

`P(removed) = P(impeached) × P(67 or more guilty votes | Senate)`

- **P(House outcome) and P(Senate):**
  - In a user's own scenario the chambers are fixed, so this is 1.
  - For a "forecast" view, run a Monte Carlo over per-race Kalshi prices. This is the same engine as tipping-point races (section 4.1). Races with no market are labeled, not filled in.
- **P(articles pass | House):** a vote-count model. Each majority member votes yes with probability `p`, and each minority member with probability `q`. The articles pass if the yes votes reach 218. Fit `p` and `q` from the four presidential impeachment roll calls, and verify them against the House Clerk before use:

  | Year | Vote | Crossover |
  |---|---|---|
  | 1868 (Johnson) | 126–47 | Party line |
  | 1998 (Clinton, Article I) | 228–206 | 5 D yes, 5 R no |
  | 2019 (Trump, Article I) | 230–197 | 0 R yes, 2 D no |
  | 2021 (Trump) | 232–197 | 10 R yes, 0 D no |

  A narrow majority then becomes fragile without any extra assumption.
- **Whether a majority brings articles at all.** This cannot be read from the data. Three options, which can sit side by side:
  - **(a) Market price.** Use a Kalshi impeachment market if the catalog lists one, labeled "market price" with the provider and fetch time.
  - **(b) User slider.** The user sets "chance the majority brings articles", so the judgment stays theirs. This fits "a simulation, not a forecast".
  - **(c) Base rate.** Impeachments per Congress in which the House was held by the party opposed to the president, since 1868. This needs a count from the House history tables.
- **P(67 or more guilty | Senate):** the same binomial model, with the cross-party guilty rate fitted from the Senate trials:

  | Year | Result | Cross-party guilty votes |
  |---|---|---|
  | 1999 (Clinton) | Acquitted | 0 D |
  | 2020 (Trump) | Acquitted | 1 R (Romney, Article I) |
  | 2021 (Trump) | Acquitted, 57–43 | 7 R |

  No president has been convicted. The card shows this history rather than hiding a near-zero number.

**Rules**

- **Process, not merits.** Call the card "Impeachment vote math". It never says or implies whether impeachment is warranted.
- **Any president.** The code takes the sitting president and the parties as inputs, not a hard-coded name. It names Trump only because he holds the office through Jan 20, 2029.
- **Sources for every number.** Probabilities come from code: roll-call fits, the Monte Carlo, or a labeled market price. A methodology page shows the roll-call tables with their sources.
- **No bare probability.** A probability is shown only with its inputs: the chamber odds, `p`, `q`, and the source of the "brings articles" factor.
- **Flag:** `VITE_FEATURE_IMPEACHMENT_MATH`.

**Timing.** Layer 1 is frontend-only and small, so it could ship before the Oct 24 feature freeze. Layer 2 waits until the formula is agreed, which means after Nov 3 unless the Kalshi Monte Carlo for tipping-point races lands first.

**To decide**

- Which of (a), (b), or (c) drives "brings articles". Suggestion: (b) in the simulator, with (a) shown next to it when a market exists.
- Whether to show removal odds at all, given they are near zero, or only the "votes needed" count.

### 4.11 Economic indicators (FRED)

A strip of tiles directly under the Kalshi House and Senate control banner on the monitor. It shows the economy next to the chamber-control odds, as context. It is **never presented as a forecast or as an explanation of why the odds moved.** No migration is needed: the series go into `indicator_series` and `indicator_observations` (batch 1), and the `(series_id, observed_at)` unique key lets revised values overwrite old ones in place.

**National series (22)**

| Tile | FRED IDs | Frequency | Shown as | Original source |
|---|---|---|---|---|
| GDP growth | `A191RL1Q225SBEA` | Quarterly | Annualized %, as published | BEA |
| GDPNow | `GDPNOW` | Quarterly, updated several times a month | Annualized %, labeled "Atlanta Fed estimate for Q_" | Atlanta Fed |
| Oil | `DCOILWTICO`, `DCOILBRENTEU` | Daily | Dollars per barrel for WTI; Brent in the tooltip | EIA |
| Gas | `GASREGW` | Weekly | Dollars per gallon, with the change over 1 year | EIA |
| Inflation | `CPIAUCSL`, `CPILFESL` | Monthly | Change from a year ago, computed in code; core CPI in the tooltip | BLS |
| (no tile) | `CPILEGSL` | Monthly | Stored only. The inflation-adjusted gas toggle in section 4.8 uses it. | BLS |
| Unemployment | `UNRATE` | Monthly | % | BLS |
| Jobs | `PAYEMS` | Monthly | Change from the previous month, in thousands | BLS |
| Jobless claims | `ICSA` | Weekly | Count | Department of Labor |
| Fed rate | `DFEDTARL`, `DFEDTARU` | Daily | The target range, e.g. "4.25–4.50%" | Federal Reserve Board |
| Mortgage rate | `MORTGAGE30US` | Weekly | % (30-year fixed) | Freddie Mac |
| Treasuries | `DGS10`, `DGS2`, `T10Y2Y` | Daily | The 10-year yield; the 2-year yield and the 10-year minus 2-year gap in the tooltip | Treasury, through the Fed's H.15 |
| Real income per person | `A229RX0` | Monthly | Change from a year ago | BEA |
| Consumer sentiment | `UMCSENT` | Monthly | Index (FRED shows it about a month late) | University of Michigan |
| Home prices | `USSTHPI` | Quarterly | Change from a year ago (all-transactions index) | FHFA |
| *Restricted* | `SP500`, `VIXCLS` | Daily | Ingested but **not served** until the licensing is cleared (see below) | S&P Dow Jones Indices, Cboe |

- **S&P 500 and VIX.** FRED's copies carry notices from S&P Dow Jones Indices and Cboe that bar reproduction without permission. Like AAA gas prices (section 4.8), we do not publish them until the terms are read or permission is granted. They stay hidden behind `FRED_RESTRICTED_SERIES_ENABLED`, which is off by default.
**State series (5 for each of the 50 states and DC, 255 in all; added Oct 16)**

`{ST}` is the postal code. The list is `STATE_FIPS_TO_POSTAL` from the Census client minus Puerto Rico, which FRED has none of these series for. They are ordinary `indicator_series` rows (`fred.CAUR` and so on), so there is still no migration.

| Tile | State series | U.S. counterpart | Shown as | Original source |
|---|---|---|---|---|
| Unemployment | `{ST}UR`, monthly | `UNRATE` | % | BLS (LAUS) |
| Jobs added | `{ST}NA`, monthly, thousands | `PAYEMS` | Change from the previous month | BLS (CES) |
| Jobless claims | `{ST}ICLAIMS`, weekly, **not seasonally adjusted** | `ICSA` | Count | Department of Labor |
| GDP growth | `{ST}RQGSP`, quarterly real GDP level | `A191RL1Q225SBEA` | Annualized % from the prior quarter, computed in code (`qoq_annualized`) | BEA |
| Home prices | `{ST}STHPI`, quarterly | `USSTHPI` | Change from a year ago | FHFA |

- **`qoq_annualized`.** `((v / prev)^4 − 1) × 100`, null unless the previous row is exactly the prior quarter, so a missing quarter never shows as two quarters of growth.
- **State claims staleness.** State claims come out a week after the national figure, so they allow 21 days (`staleAfterDays` on the series) instead of the weekly 14; otherwise they would show "Stale" every Wednesday.

- **National gas.** `GASREGW` is FRED's copy of EIA's U.S. regular series (`EMM_EPMR_PTE_NUS_DPG`), so it needs no second key before the freeze. When the EIA feed for section 4.8 lands, the U.S. gas figure must come from one source only: either 4.8 reads this series or it replaces it.

**Backend** (`backend/src/services/fred/`, modeled on `services/census/`)

1. **Catalog** (`series-catalog.ts`). The tables above as data, with each series' key (`fred.<ID>`), unit, frequency, original source, transform (`level`, `yoy`, `mom_change`, or `qoq_annualized`), a `restricted` flag, its `stateCode` (null for national series), and an optional `staleAfterDays`. The state series are built from 5 templates; `stateSeries(code)` returns one state's. `FRED_CATALOG_VERSION` (`fred-indicators-v2`) is used as the `IngestionRun` parser version.
2. **Client** (`fred-client.ts`). `FredClient` calls `/series/observations?file_type=json`, shaped like `CensusClient`. FRED's `"."` value means missing, so it becomes no row, never 0. `redactedUrl()` removes `api_key` so the key is never logged or stored. A run makes about 277 requests (22 national, 255 state), so requests, retries included, start at least `minIntervalMs` apart (600 ms, about 100 a minute) to stay under FRED's 120 per minute. A run takes about 4 minutes, well inside the 30-minute lease.
3. **Sync** (`fred-sync.ts`). Follows `syncAcs`: insert the `DataSource` (key `fred`, authority "Federal Reserve Bank of St. Louis"), open an `IngestionRun`, and upsert each `IndicatorSeries`. Every run also rewrites the source's coverage text, so a source created by an older catalog picks up the new one.
   - **Window:** a series with no rows backfills 5 years. Later runs re-fetch the last 400 days, which catches revisions to GDP and payrolls and the annual CPI seasonal-factor update.
   - **Writes:** insert new rows and update only rows whose value changed, with a new `fetched_at`.
   - **Window detail:** FRED can return the observation for the period containing the start date (Sep 1 for a monthly series asked from Sep 10), so stored rows are compared from the earliest date returned.
   - **Failures:** one failing series is recorded and the run continues. If some series fail, the run ends as `PARTIAL`; if all fail, it ends as `FAILED`. In both cases the source's health is `DEGRADED`.
   - **No `RawArtifact` yet.** Its storage is still the local filesystem, which a Railway redeploy wipes. The ACS sync skips it too. The source URL, without the key, goes in the run's metadata. Revisit once the Railway Bucket (section 5.3) exists.
4. **Runner and CLI.** `run-fred-sync.ts` holds the `fred` `SyncLease` (30 minutes), like the Schedule E runner. `npm run sync:fred` runs it by hand. It exits non-zero if the run failed or if no shown series has data. A healthy re-run inserts almost nothing, so the number of rows written is not the test. The future `cron-econ` Railway service runs `node dist/scripts/sync-fred.js`.
5. **Schedule.** In `jobs/scheduler.ts`, at 9:15 and 18:15 ET daily. The morning run is after the 8:30 BLS and BEA releases; the evening run is after the afternoon updates for rates, oil, and mortgages. It is scheduled only when `FRED_API_KEY` is set and `ECON_INDICATORS_ENABLED` is on.
6. **Read service and API.** `GET /api/indicators?days=730&state=CA`. For each national series it returns:
   - the latest value and its period ("Aug 2026", "Q2 2026", "Week ending Oct 10"). FRED dates weekly values to the *last* day of the week: Saturday for claims, Monday for gas, Thursday for mortgages.
   - the change for its transform, computed in code from stored levels. A year-over-year change is null if the observation from a year earlier is missing.
   - a stale flag, measured from the **end** of the latest period rather than its FRED date. FRED dates monthly and quarterly values to the period's first day, so counting from that date would flag September CPI (dated Sep 1, published Oct 15) as stale. The limits are 7 days (daily), 14 (weekly), 75 (monthly) and 150 (quarterly), unless the series sets `staleAfterDays`. Monthly is 75 rather than 60 because FRED shows consumer sentiment about a month late.
   - 2 years of history, with daily series reduced to one value per week
   - a source line, e.g. "BLS via FRED, fetched Oct 15"
   
   - `change`: year over year for `yoy` series; annualized from the prior quarter for `qoq_annualized`; for the rest, the difference from the previous observation. `changeHistory` gives the same change for each point, so the inflation and real-income charts plot the rate rather than the index.

   `state` is optional: two letters, uppercased before it is checked; anything else is a 400. With it, the response adds `state: { code, supported, series }`, read in the same query as the national series. `supported` is false for a well-formed code FRED has no series for (Puerto Rico); the monitor never asks for its fictional state. Without it, `state` is null.

   It answers `404 NOT_LOADED` before the first sync (judged on the national rows only), and 404 when the flag is off. The response is cached for 15 minutes (`Cache-Control: max-age=900`; there is no shared cache helper).

**Frontend** (`CODE/src/features/election-monitor/`)

- **`EconomyStrip.tsx`**, placed under each `ControlOddsBanner`. In the expanded map's overlay it is compact, with no charts or footer. Data comes from `useEconIndicators(days, stateCode)` in `economy.ts`, whose `buildTiles()` turns the series into 14 tiles.
  - Each tile shows a label, value, change, small chart, and period.
  - The row scrolls sideways at every width rather than wrapping, so the map stays high on the page.
  - **With a state selected**, the strip asks for `?state=` and shows that state's 5 tiles (GDP growth, unemployment, jobs, claims, home prices). The tiles FRED only has for the U.S. are **hidden**. The row is labelled with the state, each tooltip carries the U.S. figure ("U.S.: 4.3%, Sep 2026"), and the footer names the state sources and notes that state claims are not seasonally adjusted. A state FRED has no series for keeps the national strip, and the previous tiles stay up while another state loads.
  - Small state counts keep one decimal under 10K ("+0.4K", not "+0K"); claims under 1,000 show the plain number.
- **`IndicatorHistoryDialog.tsx`**. Each tile is a button (click, Enter, or Space) that opens a history chart in a dialog, in the compact overlay too.
  - It fetches the 5-year backfill (`days=1825`) and cuts 1Y / 2Y / 5Y ranges from it on the client. The header shows the label, scope (state or "United States"), latest value, period, change, and the stale pill; the footer gives the source line(s) and the "context, not a forecast" note.
  - With a state selected, the U.S. is compared on **one axis** for unemployment, GDP growth, and home prices, with a legend. Jobs and claims, whose sizes are not comparable, get a **state chart and a U.S. chart**, each on its own axis. Never two y-scales on one chart.
  - Neutral inks only: the state line is the foreground colour, the U.S. line muted and dashed. Lines break at missing periods (`indicatorGaps.ts`, shared with the sparkline). A collapsed data table gives the values as text, and focus returns to the tile on close.
  - Recharts loads with the first dialog opened, not with the monitor.
- **`IndicatorSparkline.tsx`**, a new small chart that reuses `sparkline.css`. The existing `Sparkline` is built for hourly prices on a 0–100% scale, and we leave the shipped market history alone before the freeze.
- **Neutral changes.** Arrows and chips use neutral colors, never red for bad and green for good. Whether rising rates or falling oil is good depends on who is asked.
- **States.** Missing shows "Not available"; stale shows an amber "Stale" pill.
- **Footer note:** "Economic data via FRED (Federal Reserve Bank of St. Louis). Shown for context, not as a forecast or an explanation of market odds." Each tile's tooltip names its original source and fetch date.
- **Flags:** `VITE_FEATURE_ECONOMY` (frontend, on by default); `ECON_INDICATORS_ENABLED` (backend, on by default); `FRED_RESTRICTED_SERIES_ENABLED` (backend, off by default).

**Tests.** Added to `test:results`:
- the client: parsing, missing values, and the key removed from URLs
- the indicator math: year-over-year, monthly change, staleness, weekly reduction, and restricted series left out
- a database test of the sync: backfill, incremental run, a revised value, and a partial failure. It uses test-only `fred-test.*` keys and is skipped without `TEST_DATABASE_URL`.
- the route's query checking, including `state`
- the catalog: 51 × 5 state series, unique keys and IDs, none for Puerto Rico
- `qoq_annualized` (including a skipped quarter) and the stale override
- the read model's state block, `supported: false`, and NOT_LOADED judged on national rows

**Commits (shipped Oct 15).** Each passes typecheck and build on its own:
1. client and catalog
2. sync, runner, CLI, and schedule
3. a fix to the sync's stored-rows window
4. API
5. the monitor strip
6. this plan

**Commits for the state series and history charts (shipped Oct 16).** Each passes typecheck, tests, and build on its own:
1. pace FRED requests under the 120/min limit
2. state series, `qoq_annualized`, and the claims stale override
3. `?state=` on the API
4. the strip follows the selected state
5. the history chart dialog
6. this plan

The frontend has Vitest tests for `buildTiles()` (national and state tiles, the fallback for unsupported states, the small-number formats) in `economy.test.ts`, and for the chart helpers in `indicatorGaps.test.ts` and `indicatorHistory.test.ts`.

**Verify.**
- Run `npm run sync:fred` against the dev database, then run it again and confirm the second run changes almost nothing.
- Spot-check `UNRATE`, year-over-year CPI, and `DGS10` against fred.stlouisfed.org.
- Confirm `SP500` and `VIXCLS` are absent from `/api/indicators` unless their flag is on.
- Check the strip at desktop and phone widths.
- After the state series land, run `npm run sync:fred` with `FRED_API_KEY` set: it should end `SUCCEEDED` with zero failed series (a wrong ID would leave the source `DEGRADED` every run). Spot-check `CAUR`, `TXNA` month over month, `NYRQGSP` annualized growth, and `FLSTHPI` year over year against fred.stlouisfed.org.
- `curl '/api/indicators?state=CA'`, then `?state=PR` (`supported: false`), then `?state=ZZZ` (400).
- Pick a state: 5 state tiles appear and the U.S.-only tiles disappear; clear it and all 14 national tiles return. Open a tile: ranges switch, the overlay or stacked chart appears, gaps render, and the keyboard opens and closes it.

**Timing.** Small, free, and needs no migration, so it ships before the Oct 24 feature freeze.

### 4.12 Research chatbot with accounts (Claude)

A research assistant that users reach by signing in with Google. It replaces today's anonymous Gemini chat. It answers questions from our stored data through tools, keeps the day's conversations so users can go back to them until the nightly reset, and can read the simulator scenario on screen to help users think through their predictions. It is how Agent 8 (Ask the race) and P06 (Ask With Receipts) reach users, and it follows the agent rules in section 4.2.

**What exists today**

- **Gemini chat:** `backend/src/controllers/chat.controller.ts` (`POST /api/chat`, `DELETE /api/chat/:sessionId`). History lives in an in-memory map (24-hour TTL, 20 messages) and is lost on every deploy. The model has no tools and no access to our data.
- **Chat UI:** `CODE/src/components/chat/` (`ChatButton`, `ChatInterface`, `ChatMessages`, `ChatInput`, `Message`), a sheet mounted in `AppShell.tsx` and `Layout.tsx`. History is kept in `sessionStorage`.
- **Researcher login:** bcrypt passwords and a 7-day JWT (`researcher-auth.controller.ts`, `lib/researcherAuth.ts`). Accounts are created only by an admin script, so it is not suitable for the public.
- **Admin sessions:** `AdminSession` stores a hashed opaque token, so a session can be revoked. This is the pattern to copy.

**Accounts: Sign in with Google** (new, separate from researcher and admin accounts)

Google sign-in is the only login for now. We store no passwords, so we need no password reset and no email verification.

- **Flow:**
  1. The `/login` page shows the Google Identity Services "Sign in with Google" button.
  2. Google returns an ID token to the browser.
  3. The browser posts it to `POST /api/auth/google`.
  4. The backend verifies it with `google-auth-library` (`verifyIdToken`). The audience must be `GOOGLE_CLIENT_ID`, the issuer must be Google, and `email_verified` must be true.
  5. The backend finds or creates the user by Google's `sub`. The first sign-in creates the account, so there is no separate signup page.
  6. The backend returns our own session token.
- **What we store:** Google `sub`, email, and display name only. No profile photo, and no Google access or refresh tokens. We request only the `openid email profile` scopes.
- **API and pages:**
  - Endpoints: `POST /api/auth/google`, `POST /api/auth/logout`, `GET /api/auth/me`, and `DELETE /api/auth/me`.
  - Pages: `/login` and `/account` (delete today's chats, delete account).
  - The auth endpoints are rate-limited per IP.
- **Sessions:**
  - **Token:** an opaque random token sent as a bearer token. Only its SHA-256 hash is stored, in `user_sessions` (modeled on `AdminSession`).
  - **Expiry:** sessions last 30 days (`USER_SESSION_TTL_DAYS`), and logout revokes the session.
  - **Why not a cookie:** Railway's `*.up.railway.app` testing domains are on the Public Suffix List, so `web` and `api` count as different sites there and a cookie would be blocked as third-party. Revisit cookies once `www` and `api` share a domain.
- **Google Cloud setup:**
  - An OAuth client of type "Web application" in a project we own.
  - Authorized JavaScript origins: the Testing `web` domain, `www`, and `http://localhost:5173` for local development.
  - An OAuth consent screen with the app name, support email, and a privacy policy link.
  - The client ID is public: `GOOGLE_CLIENT_ID` on `api` and `VITE_GOOGLE_CLIENT_ID` on `web`. No client secret is needed for the ID-token flow.
  - The `web` Content Security Policy allows `https://accounts.google.com` for the script, frame, and connect sources.

**Chat history: kept for one day, reset nightly**

- **Storage:** conversations go in `chat_conversations` and messages in `chat_messages`, both scoped to `user_id`.
- **Ownership:** a request for another user's conversation returns 404.
- **Nightly reset:** at midnight ET, a job in `jobs/scheduler.ts` deletes every conversation started before that midnight, and its messages with it.
  - Reads also hide conversations from before the last midnight ET, so history still resets on time if the job runs late or fails.
  - A chat started at 11:55 PM ET is gone at midnight. The UI says so.
- **The `/chat` page:**
  - A sidebar lists today's conversations, newest first.
  - Each conversation gets a title written once by a cheap model.
  - Users can rename a conversation, delete it, or delete all of today's chats at any time.
- **Account deletion:** deleting an account deletes its sessions, conversations, and messages.
- **Usage counts:** `chat_usage_daily` keeps per-user daily message and token counts, with no text.
  - Deleting a chat does not reset the daily cap.
  - Counts older than 90 days are dropped.
- **What the model sees:** the system prompt plus the last N turns.
- **What is saved:** tool calls and results are stored with each message, so any answer can be checked against what the model actually saw.

**Model and loop** (`backend/src/services/chat/`)

- **SDK and models:** `@anthropic-ai/sdk`. `CHAT_MODEL` defaults to `claude-sonnet-5-5`, and `claude-haiku-5-5` writes the titles.
- **Provider layer:** a thin interface that the agents in section 4.2 can reuse. No agent framework.
- **Tools:** run on the server, with at most 6 tool rounds per answer.
- **Streaming:** answers stream to the browser over SSE from `POST /api/chat/conversations/:id/messages`.
- **Prompt caching:** on the system prompt and the tool definitions.
- **Token counts:** stored on each assistant message.

**Tools** (read-only)

Each tool wraps an existing service, and every result carries its source and timestamp.

| Tool area | Backed by |
|---|---|
| Races and candidates | `election.service`, `candidate.service` |
| FEC money and outside spending | `finance.service`, `services/outside-spending/` |
| Kalshi prices, history, and movers (labeled "market price") | `prediction-markets.service`, `services/kalshi/history.ts` |
| Demographics | `demographics.service` (section 4.5) |
| Economic indicators | The `/api/indicators` read service, once section 4.11 ships |
| Past results | The section 4.9 JSON, read from the web origin and cached |
| Simulator | `get_simulator_scenario` and `propose_simulator_change` (below) |

There is no address-lookup tool, because the privacy rules forbid storing addresses. Users name a district (for example, "PA-07") instead.

**Simulator awareness and guidance**

- **Context.** When the chat is open on `/simulator` or `/simulator/midterms`, the client attaches a compact `simulatorContext` to each message:
  - the chamber and the URL search string
  - totals and control from `simulateSenate` and `simulateHouse` (`CODE/src/features/simulator/midterms/model.ts`)
  - the seats flipped from the baseline
  - the seats each party needs (`HOUSE_TO_CONTROL`, `SENATE_TO_CONTROL`)
- **Numbers come from code.** The client's simulator model produces those numbers, not the AI. The server validates the context with Zod, caps its size, and treats it as untrusted user input.
- **Saved with the message.** The context is stored on the user's message, so the history can link back to that exact scenario.
- **Guidance means explaining the user's own scenario.** The assistant can:
  - say what the scenario implies, for example "you are 4 seats short of 218"
  - list the closest races by Kalshi price, or by 2024 margin where there is no market
  - give historical midterm swings against the president's party, from past results
  - ask what the user believes about a race and show what that would change
- **It never says who will win.**
- **Proposed changes.** `propose_simulator_change` returns a structured patch in the `MidtermPatch` shape (House picks, national swing, state swings, picks).
  - The UI shows the patch as an "Apply to simulator" card with a diff.
  - It is applied through `useMidtermParams` only when the user clicks.
  - It is never applied automatically.

**UI**

- **The `/chat` page:** full screen, with the conversation sidebar.
- **The chat button:** the existing `ChatButton` sheet stays on every page.
  - On simulator pages, it shows a "Sees your scenario" chip.
- **Signed out:** guests cannot chat.
  - The chat button still opens the sheet.
  - The sheet shows "You must sign in to use the research assistant" with the "Sign in with Google" button, and no message box.
  - `/chat` redirects to `/login` and returns the user to the chat afterwards.
  - The chat API answers 401 without a valid session.
- **Answers:** each answer carries the "AI summary" badge and its source links (section 4.2, rule 4).
- **Under the input box:** "Don't share your address or how you plan to vote." and "Chats are deleted every night at midnight ET."

**Rules**

- **Nonpartisan.** One system prompt for every party. No endorsements, no predictions of winners, and no ranking or labeling by ideology.
- **Numbers come only from tool results or the simulator context.** When no tool has the data, the answer is "not found". A market price is never called a forecast.
- **Privacy.**
  - The assistant never asks how someone will vote.
  - Message text never goes into logs or analytics.
  - Chats last until midnight ET at most, and users can delete them sooner.
  - Messages are not used for anything other than the user's own conversations.
  - Only Google's `sub`, email, and name are kept about the user.
- **Cost controls.**
  - A per-user daily message cap (`CHAT_DAILY_MESSAGE_LIMIT`, default 50).
  - The existing per-IP limiter and a maximum message length.
  - A global kill switch (`CHAT_ENABLED`).
  - Without `ANTHROPIC_API_KEY`, chat returns 503.
- **Flags:** `CHAT_ENABLED` and `ACCOUNTS_ENABLED` (backend); `VITE_FEATURE_CHAT` and `VITE_FEATURE_ACCOUNTS` (frontend).
- **Gemini is retired.** Once this ships, remove the Gemini controller and `GEMINI_API_KEY`.

**Migration** (additive)

- `users`: `google_sub` (unique), email, and name
- `user_sessions`
- `chat_conversations`
- `chat_messages`: role, content blocks as JSON, `simulator_context` as JSON, model, and token counts
- `chat_usage_daily`: user, ET date, message count, and token counts

**Tests.** Added to `test:results`:
- Google sign-in with a mocked verifier:
  - the first sign-in creates a user
  - the next sign-in reuses that user through `sub`
  - a wrong audience, an expired token, and an unverified email are each rejected
- logout and session expiry, plus a revoked session being rejected
- the chat API returning 401 without a session
- one user unable to read another user's conversation
- the nightly reset: the job deletes conversations from earlier days, and reads hide them even before the job runs
- the daily cap, which still counts messages after a chat is deleted
- tool input validation and source fields
- the `simulatorContext` schema
- the tool loop with a mocked Anthropic client, including the round limit
- `propose_simulator_change` patches parsed by `useMidtermParams`

**Commits.** Seven separate commits, each passing typecheck and build on its own:
1. Google sign-in and sessions, with the migration
2. conversation storage, the API, and the nightly reset
3. the Claude provider, tools, and streaming
4. the chat pages and login UI
5. simulator context and Apply cards
6. Gemini chat removed
7. this plan

**Verify.**
- Sign in with Google, chat, sign out, sign back in, and confirm today's history is still there.
- While signed out, open the chat and confirm it asks you to sign in and offers no message box.
- Confirm a second Google account cannot open the first account's conversation.
- Run the reset job with a clock past midnight ET and confirm earlier chats are gone.
- Delete a chat and confirm it is gone.
- Ask about PA-07 and check the numbers against the race page.
- On `/simulator/midterms`, ask "what do I need for a House majority?" and apply a proposal.
- Check the phone layout.

**Timing.** Google sign-in and history Oct 16–19, then tools and simulator context Oct 20–23, all behind flags, before the Oct 24 feature freeze. If the Apply cards slip, they move to after Nov 3.

**Decided (Oct 15)**

- **Login:** Sign in with Google is the only login for now. A second sign-in option can come later if users ask for one.
- **Retention:** chat history lasts one day. Everything resets at midnight ET, and users can delete chats sooner.
- **Guests:** guests cannot chat. The chat tells them to sign in.

**To do before building**

- Create the Google OAuth client and consent screen, and register the Testing and production `web` origins.
- Publish a privacy policy page for the consent screen, covering what we keep (Google ID, email, name, and one day of chats).

---

## 5. Tech stack: Railway only

### 5.1 Code

| Layer | Tech | Path |
|---|---|---|
| Public web | React 18, Vite, TypeScript, Tailwind, shadcn/ui, MapLibre, served by nginx | `CODE/` |
| Admin web | React, Vite, TypeScript, Tailwind, served by nginx | `admin-dashboard/` |
| API | Node 20, Express, TypeScript, Zod, node-cron, `ws` | `backend/` |
| Database | PostgreSQL 16 with Prisma 6 | `backend/prisma/` |
| AI | Anthropic Claude (`@anthropic-ai/sdk`) for chat (section 4.12) and the agents, through one provider layer. Gemini (`@google/generative-ai`) runs today's chat until 4.12 ships. | `backend/src/` |
| Local development | `docker-compose.yml` (Postgres, backend, frontend, admin) | repo root |

### 5.2 Railway services (one project, `staging` and `production` environments)

| Railway service | Source | Notes |
|---|---|---|
| `web` | `CODE/Dockerfile` | `VITE_*` values are build args, so changing one requires a rebuild. Domain: `www`. |
| `admin` | `admin-dashboard/Dockerfile` | Domain: `admin`, kept separate from the public site. |
| `api` | `backend/` (`railway.toml`) | `preDeployCommand` runs `prisma migrate deploy` once per deploy. Healthcheck is `/api/health/ready`. Domain: `api`. |
| `postgres` | Railway PostgreSQL | System of record. Daily backups enabled; restore tested before Oct 30. |
| `market-feed` | `backend/` worker entrypoint, **1 replica** | Holds the single Kalshi WebSocket and writes hourly `market_snapshots`. It must be separated from `api` before `api` scales past one replica (see the Redis row). |
| `redis` | Railway Redis | Pub/sub that fans Kalshi quotes from `market-feed` out to every `api` replica's SSE clients. It also provides locks for jobs. It is a cache only, never the source of truth. |
| `cron-*` | Railway cron services running `backend/` jobs | FEC sync, ideology sync, FRED, ACS, NYT and AP news ingestion (`cron-news`), and the agent jobs. Each is a one-off run that exits when done, so jobs never run inside API replicas. `SyncLease` prevents overlapping runs. |
| `results-ingestor` | `backend/` worker, **exactly 1 replica** | Election night only. Polls the licensed provider, writes append-only `ResultSnapshot`s, and calls `publishSnapshot()`. Voter requests never trigger a call to the provider. |
| `bucket` | Railway Bucket (S3-compatible) | Raw provider payloads (`RawArtifact`, keyed by content hash) and large geo assets. |

**Election-night scaling:** `api` scales horizontally because it only reads, and public reads are cached. `market-feed` and `results-ingestor` stay at one replica each.

### 5.3 Migration checklist (Oct 8–14)

- [ ] Create `staging` and `production` environments in the Railway project. Use Railway private networking (`api.railway.internal`) between services. *Oct 10: the project has `Testing` and `production`. Only `Testing` is wired up; production's backend has no domain and its frontend has no variables.*
- [ ] Deploy `web` and `admin` from their Dockerfiles. Set `VITE_API_URL` to the Railway `api` domain.
- [ ] Replace `.github/workflows/frontend-deploy.yml` and `admin-deploy.yml`, which deploy to Vercel, with Railway deploys (`railway up --service web|admin`, like `backend-deploy.yml`) or with Railway's GitHub autodeploy. Then remove the Vercel secrets.
- [ ] Move `sync-fec-data.yml` and the in-process `node-cron` schedules to Railway cron services.
- [ ] Split the Kalshi live feed into `market-feed` and add Redis fan-out.
- [ ] Add a Railway Bucket and point `RawArtifact` storage at it instead of the local filesystem.
- [ ] Set up DNS for `www`, `api`, and `admin`. Set CORS through `FRONTEND_URL` and `ADMIN_URL`.
- [ ] Prove that a backup and restore works and that rolling back to a previous Railway deployment completes within 15 minutes.

### 5.4 External data sources

| Source | Used for | Key / variable |
|---|---|---|
| FEC OpenFEC API and bulk files | Candidates, committees, finance, outside spending (Schedule E) | `FEC_API_KEY` (1,000 calls/hour, shared); `SCHEDULE_E_WINDOW_DAYS`, `SCHEDULE_E_MAX_PAGES` |
| Kalshi REST and WebSocket | Live market prices | `KALSHI_LIVE_ENABLED`, `KALSHI_API_KEY_ID`, `KALSHI_PRIVATE_KEY` |
| Geocodio | Address to 2026 district | `GEOCODIO_API_KEY`, `GEOCODIO_DAILY_LOOKUP_LIMIT` |
| GovTrack and unitedstates/congress-legislators | Ideology, incumbents | `IDEOLOGY_*` |
| Census (cartographic boundaries, ACS) | Maps, demographics (`npm run sync:acs`) | `CENSUS_API_KEY` (required for the sync; Census rejects keyless requests). See `CODE/public/geo/SOURCES.md` |
| MIT Election Data + Science Lab (Harvard Dataverse CSVs) | Past results: county and state presidential returns, Senate by state, House by district (section 4.9) | No key; raw files in `backend/data/medsl/` (not committed), converted with `npm run build:past-results` in `CODE/`; attribution required |
| FRED (St. Louis Fed) | Economic indicators: 21 series (section 4.11); `SP500` and `VIXCLS` not served until licensing is cleared | `FRED_API_KEY`; `ECON_INDICATORS_ENABLED`, `FRED_RESTRICTED_SERIES_ENABLED` |
| EIA API v2 (`petroleum/pri/gnd`) | Weekly gas prices: U.S., 9 states, PADD regions (section 4.8) | `EIA_API_KEY`, to add (free) |
| BLS API (QCEW, CES, LAUS, CPI) | Jobs by state and county, gasoline CPI (section 4.8) | `BLS_API_KEY`, to add (free) |
| Census International Trade API (`intltrade/imports/statehs`, `exports/statehs`) | Imports and exports by state, product, and country (section 4.8) | `CENSUS_API_KEY` (existing) |
| NTUF State Tariffs Tracker (tariffs.org JSON) | Extra tariffs paid by state, quarterly (section 4.8) | No key; attribution required; check the terms |
| Federal Reserve FEDS Note (Sep 3, 2026) | Imported share of consumer spending, 31 states (section 4.8) | Static dataset, loaded once |
| Apify (Google News search actor, chosen by bake-off) | News headlines, outlets, and links per race; Agent 1 and 10 input (`docs/plans/news-agents.md`) | `APIFY_TOKEN`, `APIFY_NEWS_ACTOR_ID`, `APIFY_PRICE_PER_1000_USD`; spend caps `NEWS_DAILY_BUDGET_USD`, `NEWS_TOTAL_BUDGET_USD` |
| New York Times APIs (Times Newswire, Article Search) | News on race pages; Agent 1, 3, and 5 input | `NYT_API_KEY`, to add (section 4.6) |
| AP Media API | News on race pages; Agent 1, 3, and 5 input | **No access**; news runs on NYT alone (`docs/plans/polling-data.md`) |
| VoteHub Polling API (`api.votehub.com/polls`) | Race polls and the polling average, stored in a separate polls database | No key; CC BY 4.0, attribution required; beta. `POLLS_DATABASE_URL`, `POLLS_ENABLED`, `VOTEHUB_API_BASE_URL` (`docs/plans/polling-data.md`) |
| YouTube IFrame player (`youtube-nocookie.com`) | Network election-night live streams (section 4.7) | No key; video IDs set by admins on election day |
| AP Elections API or Decision Desk HQ | Election-night results | **not licensed yet**; check whether our AP account includes it (section 4.6) |
| Anthropic (Claude) | Research chatbot (section 4.12) and agents | `ANTHROPIC_API_KEY` (chat returns 503 when blank), `CHAT_MODEL`, `CHAT_DAILY_MESSAGE_LIMIT` |
| Google Identity Services (Sign in with Google) | Chatbot login (section 4.12) | `GOOGLE_CLIENT_ID` (`api`), `VITE_GOOGLE_CLIENT_ID` (`web`); public client ID, no secret |
| Gemini | Today's anonymous chat; retired when section 4.12 ships | `GEMINI_API_KEY` |

### 5.5 Moving the main database (Oct 29)

Testing's main database (`Testing_database`, a 0.5 GB volume) is nearly full. Everything except polls moves to `Third_database` (5 GB). Polls stay in `Polling_data` (`POLLS_DATABASE_URL`).

- **One variable moves it.** Every read and write except polls goes through one Prisma client on `DATABASE_URL` (`backend/src/config/database.ts`). The pre-deploy step, `npm run prisma:deploy`, runs the same migrations on the new database, so its tables match the old one's exactly.
- **The old rows come too.** The API reads from the database it writes to, so an empty new database would show no candidates, finance, price history, or admin accounts until the syncs refill it, and price history and accounts never come back. With `COPY_FROM_DATABASE_URL` set, `prisma:deploy` copies every row from that database into the new one right after the migrations (`backend/src/scripts/copy-database.ts`).
  - It writes only into an empty database, in one transaction, so it copies everything or nothing. Once the new database has rows it skips without connecting to the old one.
  - The old database is only read.
  - `sync_leases` is left out, and copied syncs still marked running are marked failed, so neither blocks the new deployment's syncs.
  - Preview with `npm run db:copy -- --dry-run`.

**Railway steps (Testing)**
1. On `Backend`, set `COPY_FROM_DATABASE_URL` to `${{Testing_database.DATABASE_URL}}` and change `DATABASE_URL` to `${{Third_database.DATABASE_URL}}`. Leave `POLLS_DATABASE_URL` as it is.
2. Deploy. The pre-deploy log ends with `✅ Copied N rows in M tables`. If the copy fails, the deploy stops, the old deployment keeps running on the old database, and the new database stays empty for the next try.
3. Check the site and the admin dashboard. Removing `COPY_FROM_DATABASE_URL` afterwards is optional.
4. Keep `Testing_database`: the copy never changes it, so it stays a full backup.

Writes the old deployment makes during the copy, a few minutes' worth, stay only in the old database. Production's pre-deploy command is `npx prisma migrate deploy`, which skips the copy: change it to `npm run prisma:deploy` before moving production's database the same way.

---

## 6. Data model roadmap

Conventions:

- UUID primary keys and `snake_case` names through `@map`.
- Money is `DECIMAL(15,2)` and vote counts are `BIGINT`.
- Probabilities are `DECIMAL(5,4)` in [0, 1].
- Every externally sourced row links to a `DataSource`, an `IngestionRun`, and a `RawArtifact`.
- Results are append-only. A correction creates a new snapshot, and publishing moves `Contest.currentSnapshotId`.
- Migrations stay additive until after the election.

| Batch | When | Tables |
|---|---|---|
| 1 | Done | `market_snapshots`, `indicator_series`, `indicator_observations`, `district_profiles`, `agent_runs` |
| 2 | Oct 8–14 (news tables Oct 27, `docs/plans/news-agents.md`) | `articles` (Apify, then NYT and AP; unique on source and external ID), `article_tags`, `agent_outputs` (with review status), `agent_output_citations`, `race_signal_events`, `win_probability_values` |
| 3 | Oct 15–24 | `polls`, `poll_results`, `early_vote_reports`, `control_simulations`, `historical_results` (with `PRESIDENT` rows and new columns on `county_results`, section 4.9), `users`, `user_sessions`, `chat_conversations`, `chat_messages`, `chat_usage_daily` (section 4.12) |
| 4 | Oct 25–30 | `race_calls` (a media projection, kept separate from `certification_events`), then a schema freeze |

Schema cleanup to do after the election:

- Nullable composite unique keys need `NULLS NOT DISTINCT`.
- The contest natural key isn't unique.
- Drop the duplicate indexes on `candidates` and `committees`.
- Convert the legacy string status columns to enums.

**Connecting an election-results provider** (requires no route changes):

1. Get a signed contract that confirms coverage, redistribution rights, rate limits, and support.
2. Insert a `DataSource` with `homepageUrl`, `attributionText`, and `expectedCadenceSeconds`.
3. Ingest into `ResultSnapshot`, `CandidateVote`, and `ContestMetric`, then call `publishSnapshot()` in the same transaction.
4. Set `isEnabled` and add the source's key to `RESULTS_PROVIDER_ENABLED_IDS`.

If no provider is licensed in time, the site links to official state results and does not show scraped or partial totals.

---

## 7. Working agreements

- **All work merges into `2026Midterm_intel_v2`.** Branch from it, open every PR against it (never `main`), and merge it into your branch to resolve conflicts.
- **Verify before merging.** In `CODE/`, run `npm run lint -- --max-warnings 0 && npm run typecheck && npm run build`. In `backend/`, run `npm run typecheck && npm run build && npm run test:results`.
- **Feature flags** gate every new module. `VITE_*` flags need a rebuild of `web`.
- **No secrets in frontend bundles.** All keys live in Railway service variables.
- **This file is the plan.** Update it here instead of adding new planning docs.
