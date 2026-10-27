# News agents: Apify trending stories, re-ranked by Claude

Revised Oct 27. This replaces the Oct 26 draft, which planned per-race searches, a triage agent, and per-race top stories.

## Context
No news source is connected yet (PLAN.md §2, "Known gaps"). We have an **Apify** account with **$205 of credits**. Apify runs third-party actors that read Google News and return each article's headline, outlet, link, and publish time.

Decisions made on Oct 27:
- **Apify pulls the news.** NYT and AP stay in §4.6 as later sources for the same `articles` table.
- **The ranking is layered.** Code ranks Apify's results by a published trending score, and that list works on its own with no AI. Claude then re-ranks the top stories for likely midterm impact, behind a flag. The trending list stays as the fallback.
- **Version 1 is one national list.** There are no per-race searches, no race News tab, and no triage agent.

What "Apify ranks" means in practice: Apify doesn't judge importance. Its Google News actors return Google's own signals: the top-stories and topic feeds with each story's rank, and the other outlets Google groups with the same story. The code turns those signals into a score.

**Timing.** The feature freeze was Oct 24, and the code freeze is Oct 30. Everything here is behind flags that are off by default, on branch `feat/news-trending`.

## Status
Built Oct 27 on `feat/news-trending`, which is not pushed or merged yet. All flags are off.

- [x] Schema: `articles`, `agent_outputs`, `agent_output_citations`
- [x] Apify client, actor adapters, schedule, and budget guard
- [x] Normalizing, story clusters, trending score, and `npm run sync:news`
- [x] Fixes from the security review: http(s)-only related links, and a charged run never counted as free
- [x] `GET /api/news/top` and the monitor card
- [x] Agent 10 re-ranks with Claude
- [x] Admin spend and audit panel
- [ ] Push the branch and merge it
- [ ] Live Apify run (the bake-off) and a live Claude call
- [ ] Rollout steps 1–5 below

## How it works

```
cron (every 30 min) ─► run due? budget left? ─► one Apify actor run over the feed plan
   ─► normalize + dedupe ─► articles ─► cluster into stories + trending score (code)
   ─► Agent 10 re-ranks the top 30 (Claude, optional) ─► agent_outputs ─► /api/news/top ─► card
```

### Layer 1: Apify fetches (`backend/src/services/news/apify-client.ts`, `apify-actors.ts`, `feeds.ts`)
- **One actor run per pass** reads:
  - US top stories
  - the U.S. topic section (`NATION`)
  - any Elections topic IDs in `NEWS_ELECTION_TOPIC_IDS`
  - 7 national election searches over the past day: "midterm elections", "Senate race", "House race", "election poll", "early voting", "campaign ad", and "voting rules". "election results" is added from 6 PM ET on Nov 3 through Nov 4.
- **At most 20 articles per feed and 200 per run.** The query list is versioned (`NEWS_QUERY_VERSION`).
- **Cadence** (`schedule.ts`): every 2 hours through Nov 4, every 30 minutes from 6 PM to 2 AM ET on election night, and every 6 hours from Nov 5.
- **The client** is plain `fetch` against Apify's REST API. It starts a run asynchronously, polls it, aborts it after 10 minutes, and reads its dataset. Every run carries `maxItems` and `maxTotalChargeUsd`. The token goes in a header and never appears in a URL or a log.
- **Two actors are supported,** each through an adapter that builds its input and maps its fields:
  - `tacps126/google-news` has a `position` field and `relatedArticles`. Its input schema shows no top-stories feed.
  - `cirkit/google-news-scraper` has top stories, topic IDs, and `relatedCoverage`. It has no rank field, so the rank comes from each item's order within its feed.
  - Adding another actor means adding an adapter. Switching between the two is the `APIFY_NEWS_ACTOR_ID` setting.
- **No raw artifacts.** Each run stores its Apify run ID and dataset ID instead of a `RawArtifact`, because that storage is still the local disk, which a Railway redeploy wipes. Apify keeps the dataset.

### Budget (`budget.ts`)
- **Each run records `costUsd`:** the larger of Apify's reported cost and the article count times `APIFY_PRICE_PER_1000_USD`.
- **Runs with no recorded cost count at their upper bound** (`maxCostUsd`), never at zero. That covers runs still going and runs whose process died.
- **Before each run,** the smaller of the budget left over the rolling 24 hours (`NEWS_DAILY_BUDGET_USD`, default $8) and in total (`NEWS_TOTAL_BUDGET_USD`, default $100) sets the run's limits. A run that couldn't return 20 articles is skipped, with the reason recorded.
- **Backstop:** set a hard monthly usage limit of $110 in the Apify console.

### Layer 2: code ranks, the "Trending" list (`normalize.ts`, `trending.ts`, `TRENDING_VERSION = 1`)
- **Normalize:**
  - The canonical URL drops tracking parameters, fragments, `www.`, and AMP suffixes. Its SHA-256 is the article's `external_id`.
  - Google's " - Outlet" suffix is removed from headlines.
  - Control characters are stripped.
  - Articles are dropped, with a counted reason, if they lack a headline, link, outlet, or time; are older than 72 hours; are more than an hour in the future; or come from social, video, or press-release sites.
  - Related-coverage links must be http(s).
  - Outlets are never filtered or ranked by ideology.
- **Stories:** articles that share a link or a headline of five or more words, or that Google groups as related coverage, become one story.
- **Score:** `(ln(1 + outlets) + positionBonus) × 0.5^(hours since the story's newest article / 12)`.
  - `outlets` counts distinct outlets, including Google's related coverage.
  - `positionBonus` is 1 if Google ranked the story 5th or higher in top stories or a topic in the past 6 hours, 0.5 if 15th or higher, and 0 otherwise.
- **Election filter:** a story counts if an election search or Elections topic returned it, or if its headline or snippet uses an election term from a fixed list that is the same for every party.

### Layer 3: Claude re-ranks, Agent 10 (`top-stories-agent.ts`, `top-stories-model.ts`, flag `NEWS_AGENTS_ENABLED`)
- **When it runs:** after a news run that brought in articles. It runs at most hourly (every 30 minutes on election night), and on an unchanged set of stories only after 2 hours. It needs at least 5 election stories.
- **Input:** the 30 highest-scoring stories, as short IDs (`S1`…`S30`). Each has its headline, snippet, lead outlet, outlet count, other outlets, age, and Google rank, but no URLs or database IDs.
- **Prompt:** identical on every run. It asks for up to 10 stories most likely to affect the 2026 House and Senate elections. It names what is not a factor: the outlet, which party a story helps or hurts, and its tone. It tells the model to ignore instructions inside the stories.
- **Output (structured outputs):**
  - `picks: [{ storyId, reason, raceKeys }]`
  - `excluded: [{ storyId, why }]`
  - Reason codes: `CANDIDATE_NEWS`, `DEBATE`, `POLL`, `MONEY_OR_ADS`, `LEGAL_OR_ETHICS`, `VOTING_RULES`, `POLICY_OR_ECONOMY`, `NATIONAL_EVENT`, `RESULTS`.
  - Exclusions: `NOT_ELECTION`, `DUPLICATE`, `OPINION`, `LOW_INFORMATION`.
  - It returns no free text, so outputs publish without review (§4.2 rule 5).
- **Code checks every pick:** IDs must come from the input, a story is picked once, there are at most 10 picks, and race keys must name one of the 50 states and a real seat (`PA-SEN`, `AZ-06`, `AK-00`). Rejects are counted. Fewer than 3 valid picks are not published.
- **Model:** `NEWS_PICKER_MODEL`, default `claude-opus-5-5`, at effort `low`, with server-side refusal fallbacks (`fallbacks: "default"`). A refusal or unparsable answer fails the run and leaves the published picks alone.
- **Records:** each run is an `agent_runs` row with its input, raw output, and token counts. A published `agent_outputs` row supersedes the previous one and cites its articles in `agent_output_citations`.

## Schema (migration `20261027120000_news_articles_agent_outputs`, additive)
- **`articles`:**
  - headline, snippet, outlet, `outlet_key`, `outlet_domain`, URL, canonical URL, `published_at`
  - first and last seen times
  - `found_by` (feed labels)
  - `feed_position` and `feed_position_at` (latest Google rank)
  - `related` (Google's related coverage)
  - Unique on (source, `external_id`).
- **`agent_outputs`:** agent, scope (`NATIONAL`/`STATE`/`RACE`), scope key, status (`PUBLISHED`, `PENDING_REVIEW`, `REJECTED`, `SUPERSEDED`), and payload.
- **`agent_output_citations`:** output, article, rank, and reason.
- **`AgentKind`** gains `TOP_STORIES`.
- **Stories aren't stored.** They are computed from the past 48 hours of articles on each request (cached for a minute) and on each agent run.

## API
- **`GET /api/news/top?limit=10`** (1–20), off unless `NEWS_INGEST_ENABLED`. It returns `{ mode, reason, updatedAt, consideredCount, trendingVersion, items }`.
  - Each item has its headline, outlet, URL, publish time, outlet count, Google rank, reason, race keys, and other outlets.
  - `mode` is `top` while the AI picks are under 3 hours old and the agent is on. Otherwise it is `trending`, with the reason. With nothing to show it is `none`, with a sentence saying why.
- **`GET /api/admin/news-status`** (admin) returns spend against the caps, recent news and agent runs, and the audit table described under Frontend.

## Frontend
- **A "Top election stories" card** sits above Biggest movers in the monitor's lower rail, gated by `VITE_FEATURE_NEWS` (**off unless set to "true"**).
  - Each row shows the headline linked to the publisher (http(s) only), the outlet, age, and "N more outlets".
  - In AI mode it adds an "AI-selected" label, a reason label, and race chips that select the race on the map.
  - "How this is ranked" spells out the formula and what the AI may consider.
- **The admin dashboard's "News and top stories" panel** shows spend, settings, and recent runs. It also shows the trending order next to the AI's ranks, reasons, and exclusions, so editors can check for skew.

## Settings (backend `api` service unless noted)

| Variable | Default | Purpose |
|---|---|---|
| `APIFY_TOKEN` | none | Apify API token (Railway secret) |
| `APIFY_NEWS_ACTOR_ID` | none | `tacps126/google-news` or `cirkit/google-news-scraper`, set from the bake-off |
| `APIFY_PRICE_PER_1000_USD` | `2` | All-in price per 1,000 articles, used for estimates and caps |
| `NEWS_INGEST_ENABLED` | `false` | The news API and the in-process schedule |
| `NEWS_SCHEDULER_IN_PROCESS` | `false` | Runs the job from the `api` process every 30 minutes, for Testing, until a `cron-news` service exists |
| `NEWS_DAILY_BUDGET_USD` / `NEWS_TOTAL_BUDGET_USD` | `8` / `100` | Apify spend caps, rolling 24 hours and in total |
| `NEWS_ELECTION_TOPIC_IDS` | empty | Google News topic IDs (`CAAq…`) whose articles count as election news |
| `NEWS_AGENTS_ENABLED` | `false` | Agent 10 and "top" mode |
| `ANTHROPIC_API_KEY` | none | Claude, shared with the §4.12 chatbot |
| `NEWS_PICKER_MODEL` | `claude-opus-5-5` | The re-ranking model |
| `VITE_FEATURE_NEWS` (`web`) | off | The monitor card |

## Running it
- **`npm run sync:news`** runs a pass if one is due. Options:
  - `--force` runs now.
  - `--actor=<id>` overrides the actor, for the bake-off.
  - `--dry-run` prints the actor input and budget without calling Apify.
  - `--agent` skips Apify and runs only Agent 10.
- **On Railway,** a `cron-news` service runs `node dist/scripts/sync-news.js` every 30 minutes. Until it exists, set `NEWS_SCHEDULER_IN_PROCESS=true` on `api`.

## Rollout
None of these steps are done yet.

- [ ] **1. Bake-off (about $1).**
  - Set `APIFY_TOKEN` and `APIFY_PRICE_PER_1000_USD=2` on Testing.
  - Run `npm run sync:news -- --force --actor=tacps126/google-news`, then the same with `cirkit/google-news-scraper`.
  - Compare on the admin panel and in `ingestion_runs`: articles kept versus dropped, the share with decoded publisher URLs, whether top stories and ranks came back, related-coverage counts, and cost per run.
  - Set `APIFY_NEWS_ACTOR_ID` to the winner and `APIFY_PRICE_PER_1000_USD` to its real all-in price.
- [ ] **2. Elections topic ID.** Find the Google News Elections topic ID in the US edition and set `NEWS_ELECTION_TOPIC_IDS`.
- [ ] **Apify backstop.** Set the $110 hard monthly limit in the Apify console.
- [ ] **3. Trending only.** Turn on `NEWS_INGEST_ENABLED`, `NEWS_SCHEDULER_IN_PROCESS`, and `VITE_FEATURE_NEWS` (rebuild `web`). Watch spend for a day on the admin panel.
- [ ] **4. AI picks.** Set `ANTHROPIC_API_KEY` and run `npm run sync:news -- --agent` a few times. Review the picks and exclusions against the trending order on the admin panel. Then turn on `NEWS_AGENTS_ENABLED`.
- [ ] **5. Election night.** Check spend at 9 PM and midnight ET.

## Costs
Apify at $1.50–2 per 1,000 articles, about 160 new articles per run:

| Period | Per day | Total |
|---|---|---|
| Bake-off | — | about $2 |
| Oct 28 to Nov 2 | $3–4 | $18–24 |
| Nov 3 | $6–8 | $6–8 |
| Nov 4 | $3–4 | $3–4 |
| Nov 5 to Nov 30 | about $1–1.30 | $26–34 |
| **Total** | | **about $55–72 of $205** |

The caps sit above these estimates. About $105 is left for later per-race work.

Claude on Opus 5.5 costs about $0.05 a call at most and about 30 calls a day, so about $1.50 a day. That is billed to Anthropic, not Apify.

## Verified
- [x] **Backend tests** (`npm run test:results`) cover the Apify client lifecycle, both adapters, the schedule, the budget, normalizing, clustering and scoring, the route, the agent's checks and run rules, and the Claude request shape and parsing. The Claude tests use a fake `fetch`, so no live calls are made.
- [x] **Database tests** (`TEST_DATABASE_URL`) cover storing and refreshing articles, budget skips, upper-bound spend, publishing and superseding picks, the 3-hour fallback, and the admin audit.
- [x] **The migration** applied cleanly to an empty Postgres 16, with no drift against the schema.
- [x] **Both card modes and the admin panel** were checked in a browser against seeded sample data.
- [ ] **Not verified:** a live Apify run (the bake-off) and a live Claude call. No Anthropic key was available while building.

## Later
Not started.

- [ ] **A per-race News tab.** Add race searches using nominee names from `loadNomineeRoster()` (`services/primary-pruning.service.ts`), and race-scoped outputs (`scope_type = RACE`).
- [ ] **Agent 1 (triage)**, which Agent 3 "why it moved" will need after Nov 3.
- [ ] **A Google Trends search-interest signal** in the score.
- [ ] **NYT and AP** as additional sources once licensed (§4.6).

## To confirm
- [ ] **Apify's and each actor's terms** on storing and showing headlines and snippets. We store no article text and always link out.
- [ ] **An Anthropic key and budget** for the `api` service.
