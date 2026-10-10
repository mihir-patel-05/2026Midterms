# VoteInformed: plan, product ideas, and tech stack

Last updated: October 10, 2026
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

## 2. Where we are (as of Oct 10)

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

**Not done yet (carried over from Oct 1–7)**

- A market history API and sparklines over `market_snapshots`.
- FRED economic indicator ingestion.
- District race pages with ACS demographics and partisan lean.
- Agent foundation: shared job runner, Zod output schemas, and `AgentRun` logging.

**Known gaps**

- **Production is not set up.** On Railway, the production backend has no public domain and the production frontend has no variables. Everything so far runs in the Testing environment. See section 5.3.
- No news source is connected. The NYT and AP integrations (section 4.6) have no code or keys in the repo or in Railway yet.
- No live election-results provider is licensed. Election night depends on getting one; see section 6.
- District boundaries: `CODE/public/geo/cd119.topo.json` has to be built (`npm run build:geo`) and committed. See `CODE/public/geo/SOURCES.md`.
- The legacy frontend (`/classic`, `features/election-dashboard/*`, `react-simple-maps`, and the `VITE_FEATURE_NEW_FRONTEND` flag) is ready to be removed.

---

## 3. Plan to November 3

| When | Work |
|---|---|
| **Oct 8–14** | **Set up production on Railway first** (section 5.3). Market history API and sparklines. Biggest movers feed. NYT and AP news ingestion into `articles` (section 4.6). Agent foundation, then Agent 1 (news triage). DB batch 2. FRED indicators if time allows. |
| **Oct 15–21** | Agent 3 (why it moved), citing NYT and AP articles. Kalshi odds on the Candidates page. District race pages, with a news section. Win probability index and its methodology page. Agent 5 (daily brief). Five-Minute Briefing (P01) for pilot races. Coverage and Corrections Desk minimum (P11). DB batch 3. |
| **Oct 22–24** | Tipping-point races. Agents 2 and 4. Agent 8 (Ask the race, grounded). Early vote tracker. My Ballot kit (P02). Live coverage panel (section 4.7). **Feature freeze Oct 24.** |
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
| **Market history** | Sparklines of Kalshi prices over time on each race card and in the markets panel. Hourly rows have been collected in `market_snapshots` since Oct 10, so this needs only a history API (for example `/api/prediction-markets/history?race=PA-07&days=14`) and the chart. Volume and liquidity come later. |
| **Kalshi odds on the Candidates page** | Each candidate card shows that candidate's market price when Kalshi lists one. The live feed already carries candidate names, so this is a join on state, district, and name, with party as the fallback. |
| **Win probability index** | A published formula that blends market prices, the polling average, and fundamentals (lean, incumbency, money ratio). Versioned methodology, computed in code, and every input stored so a value can be recomputed. |
| **Economic indicators** | 10-year and 2-year Treasury yields, yield curve, S&P 500, VIX, gas prices, CPI, and unemployment, shown next to generic-ballot and chamber-control odds. |
| **Biggest movers** | The races where odds, polls, or money moved most over 24 hours or 7 days, each linked to its "why it moved" explanation. Ship the Kalshi-only version first: it runs on `market_snapshots` alone and is the trigger Agent 3 needs. Show the related NYT and AP headlines until Agent 3's explanations exist. |
| **Tipping-point races** | A Monte Carlo simulation over win probabilities that finds the seats most likely to decide House and Senate control. It can start from Kalshi prices for the 415 House and 34 Senate races that have markets, then switch to the win probability index once that exists. Races without a market are labeled, not filled in. |
| **Early vote tracker** | Ballots returned by party registration, in states that publish the data. |
| **Election night live mode** | Results, called and uncalled counts, and live odds per race. Browsers poll every 15–30 seconds; Kalshi stays on SSE. |
| **Live coverage panel** | Election-night YouTube live streams from major networks (NBC News, CNN, and others) embedded in the dashboard, so users can watch coverage next to the map and odds. See section 4.7. |

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
| 8 | Ask the race | Answers grounded only in stored data, with citations | On demand |
| 9 | Election night | Live race notes and call summaries | Nov 3 |

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
| P06 | **Ask With Receipts** | Chat answers with inspectable supporting passages (merges with Agent 8) | P2, controlled beta |
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

---

## 5. Tech stack: Railway only

### 5.1 Code

| Layer | Tech | Path |
|---|---|---|
| Public web | React 18, Vite, TypeScript, Tailwind, shadcn/ui, MapLibre, served by nginx | `CODE/` |
| Admin web | React, Vite, TypeScript, Tailwind, served by nginx | `admin-dashboard/` |
| API | Node 20, Express, TypeScript, Zod, node-cron, `ws` | `backend/` |
| Database | PostgreSQL 16 with Prisma 6 | `backend/prisma/` |
| AI | Gemini (`@google/generative-ai`) for chat today; the agents will use the same provider layer | `backend/src/` |
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
| FRED | Economic indicators | to add |
| New York Times APIs (Times Newswire, Article Search) | News on race pages; Agent 1, 3, and 5 input | `NYT_API_KEY`, to add (section 4.6) |
| AP Media API | News on race pages; Agent 1, 3, and 5 input | `AP_API_KEY`, to add (section 4.6) |
| YouTube IFrame player (`youtube-nocookie.com`) | Network election-night live streams (section 4.7) | No key; video IDs set by admins on election day |
| AP Elections API or Decision Desk HQ | Election-night results | **not licensed yet**; check whether our AP account includes it (section 4.6) |
| Gemini | Chat and agents | `GEMINI_API_KEY` (chat returns 503 when blank) |

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
| 2 | Oct 8–14 | `articles` (NYT and AP, unique on source and external ID), `article_tags`, `agent_outputs` (with review status), `agent_output_citations`, `race_signal_events`, `win_probability_values` |
| 3 | Oct 15–24 | `polls`, `poll_results`, `early_vote_reports`, `control_simulations` |
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

- **Verify before merging.** In `CODE/`, run `npm run lint -- --max-warnings 0 && npm run typecheck && npm run build`. In `backend/`, run `npm run typecheck && npm run build && npm run test:results`.
- **Feature flags** gate every new module. `VITE_*` flags need a rebuild of `web`.
- **No secrets in frontend bundles.** All keys live in Railway service variables.
- **This file is the plan.** Update it here instead of adding new planning docs.
