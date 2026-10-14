# VoteInformed: plan, product ideas, and tech stack

Last updated: October 14, 2026
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

**Not done yet (carried over from Oct 1–7)**

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
| **Oct 8–14** | **Set up production on Railway first** (section 5.3). ~~Market history API and sparklines. Biggest movers feed.~~ (done Oct 14). NYT and AP news ingestion into `articles` (section 4.6). Agent foundation, then Agent 1 (news triage). DB batch 2. FRED indicators if time allows. |
| **Oct 15–21** | Agent 3 (why it moved), citing NYT and AP articles. Kalshi odds on the Candidates page. District race pages, with a news section. Win probability index and its methodology page. Agent 5 (daily brief). Past results for president, with county shifts (section 4.9). Five-Minute Briefing (P01) for pilot races. Coverage and Corrections Desk minimum (P11). DB batch 3. |
| **Oct 22–24** | Tipping-point races. Agents 2 and 4. Agent 8 (Ask the race, grounded). Early vote tracker. My Ballot kit (P02). Live coverage panel (section 4.7). Senate and House past results (section 4.9). **Feature freeze Oct 24.** |
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
| **Economic indicators** | 10-year and 2-year Treasury yields, yield curve, S&P 500, VIX, gas prices, CPI, and unemployment, shown next to generic-ballot and chamber-control odds. |
| **Cost of living by state** | Gas prices for each state compared with the U.S. average, with 1-week, 1-month, and 1-year changes, plus tariff exposure (imported share of spending, extra tariffs paid, and trade-exposed job changes) for each state. See section 4.8. |
| **Past results** | A Past results mode on the map: winners for president (by state and county), Senate (by state), and House (by district) from MIT Election Lab files, plus county and state shifts between two presidential years. See section 4.9. |
| **Biggest movers** | The races where odds, polls, or money moved most over 24 hours or 7 days, each linked to its "why it moved" explanation. **The Kalshi-only version shipped Oct 14** (section 2); it is the trigger Agent 3 needs. Still to do: polls and money, NYT and AP headlines on each row, then Agent 3's explanations. |
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
2. **Jobs.** `cron-econ`, a Railway cron job that runs EIA weekly (Tuesday after release), BLS monthly, Census trade monthly, and NTUF quarterly. Each raw response is saved as a `RawArtifact`, and `SyncLease` prevents overlaps. This is the same job as the FRED ingestion in section 2, extended.
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

**Code changes**

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
| MIT Election Data + Science Lab (Harvard Dataverse CSVs) | Past results: county and state presidential returns, Senate by state, House by district (section 4.9) | No key; files we load with `npm run import:medsl`; attribution required |
| FRED | Economic indicators | to add |
| EIA API v2 (`petroleum/pri/gnd`) | Weekly gas prices: U.S., 9 states, PADD regions (section 4.8) | `EIA_API_KEY`, to add (free) |
| BLS API (QCEW, CES, LAUS, CPI) | Jobs by state and county, gasoline CPI (section 4.8) | `BLS_API_KEY`, to add (free) |
| Census International Trade API (`intltrade/imports/statehs`, `exports/statehs`) | Imports and exports by state, product, and country (section 4.8) | `CENSUS_API_KEY` (existing) |
| NTUF State Tariffs Tracker (tariffs.org JSON) | Extra tariffs paid by state, quarterly (section 4.8) | No key; attribution required; check the terms |
| Federal Reserve FEDS Note (Sep 3, 2026) | Imported share of consumer spending, 31 states (section 4.8) | Static dataset, loaded once |
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
| 3 | Oct 15–24 | `polls`, `poll_results`, `early_vote_reports`, `control_simulations`, `historical_results` (with `PRESIDENT` rows and new columns on `county_results`, section 4.9) |
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
