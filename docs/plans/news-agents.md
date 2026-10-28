# News agents: Apify news ingestion and AI-picked top stories per race

## Context
No news source is connected yet (PLAN.md §2, "Known gaps"). The NYT and AP integrations in §4.6 have no keys and no code. We do have an **Apify** account with **$205 of credits**. Apify runs third-party "actors" that scrape Google News by keyword and return headline, outlet, link, and publish time.

This plan builds two things:

1. **News ingestion.** A job runs one Apify Google News search per race and a few national searches. It stores each article once in `articles`.
2. **Two agents.**
   - **Agent 1, news triage**, uses a cheap model. It tags each new article with the races and candidates it is about, an event type, and whether it is opinion.
   - **Agent 10, top stories**, uses a stronger model. For each race it picks the most important recent stories from the tagged articles. It also picks a national top-stories list across all races.

Readers see an "In the news" tab on each race and a national "Top stories" card.

**Timing.** Today is Oct 26. The feature freeze was Oct 24, and code freeze is Oct 30 (PLAN.md §3). This work needs an explicit exception to the freeze. Every piece ships behind flags that are off by default. Phase 1 (ingestion plus a "Latest coverage" list) is useful on its own, so it can ship even if the picker slips.

Decisions this plan makes (change them before building if you disagree):
- **Apify is the first news source.** NYT and AP stay in §4.6 as later sources feeding the same `articles` table.
- **Headline, outlet, link, time, and the search snippet only.** We do not fetch or store publisher article text. That keeps cost down and avoids copyright problems. Agents read only the headline and snippet.
- **The picker returns article IDs and fixed reason codes, never free text.** No AI sentences about named people means picks can publish automatically (PLAN.md §4.2, rule 5).
- **Governor races are out of scope for v1.** We have no candidate data for them (FEC covers federal races only).

## What already exists
- `agent_runs` (`AgentRun`) with the unique key `(agent, prompt_version, input_sha256)`. A rerun on identical input can be skipped for free. `AgentKind` already has `NEWS_TRIAGE`.
- `DataSource`, `IngestionRun`, and `RawArtifact` for provenance. Every externally sourced row links to them (PLAN.md §6).
- `SyncLease` (`services/sync-lock.service.ts`) to stop overlapping runs, and the scheduler pattern used by FRED (`jobs/scheduler.ts`).
- Race keys from the Kalshi catalog (`services/kalshi/catalog.ts`): `PA-SEN`, `PA-07`, and `DE-00` for at-large seats. News uses the same keys, so the frontend can join on them.
- Candidate names. Kalshi markets carry an `outcome` per candidate, and `CODE/public/data/seat-holders-2026.json` names each seat's current holder. FEC `CandidateElection.ballotStatus` is always `UNCONFIRMED`, so FEC alone can't tell us who the nominees are.
- `zod` is installed. `@anthropic-ai/sdk` is not, and the §4.12 chatbot needs it too.

## Choosing the Apify actor
Apify has many Google News actors from different developers. Listed prices run from about **$0.70 to $4 per 1,000 articles**. Some add a per-run start fee or about $1 per 1,000 for decoding Google's redirect links into publisher URLs. Prices change, and the Store pages couldn't be fetched while writing this plan, so **run a bake-off before committing**.

Bake-off (about $1 of credits, Oct 27):
1. Shortlist 2–3 pay-per-result actors that return the **decoded publisher URL**, the **outlet name**, and an **exact publish time**, and that take a list of queries in one run. Candidates seen on the Store: `vortex_data/google-news`, `thirdwatch/google-news-scraper`, `hiver/google-news-scraper`, and `fabrikit/google-news-scraper`.
2. Run each on the same 10 races (5 Senate and 5 House, including PA-07 and an at-large seat) with a 1-day window and 10 results per query.
3. Score each actor on cost per 1,000 including decoding and start fees, the share of rows with a real publisher URL and time, duplicate rate, and runtime.
4. Put the winner in `APIFY_NEWS_ACTOR_ID`, and its all-in price in `APIFY_PRICE_PER_1000_USD`. The code never hard-codes an actor, so switching is a config change.

## Pipeline

```
cron-news (every 30 min) ─► which tiers are due? ─► Apify run (async) ─► dataset items
      ─► normalize + dedupe ─► articles ─► Agent 1 triage (new articles only) ─► article_tags
      ─► Agent 10 picker (races whose shortlist changed) ─► agent_outputs + citations ─► API ─► UI
```

### 1. Search queries (code, versioned as `NEWS_QUERY_VERSION`)
- **Race roster.** For each Senate and House race, take the two leading candidate names from the Kalshi catalog's outcomes. Add the seat holder from `seat-holders-2026.json` if missing. A race with no names gets a district query instead, such as `"Pennsylvania's 7th congressional district"`.
- **One query per race,** for example `("Name A" OR "Name B") (Senate OR election)`. House queries use `(Congress OR House OR district)`. If a name is common (on a short hand-kept list), add the state name.
- **National queries,** about 6: "Senate race", "House race", "midterm elections", "battleground poll", "early voting", and "election results" (on election night only).

### 2. Tiers and cadence (deterministic rule, recomputed each run)

| Tier | Which races | Window | Results per query | Runs per day before Nov 3 |
|---|---|---|---|---|
| **A** | All Senate races, plus House races whose Kalshi leader is under 80%, or that have no market (about 80 races) | 1 day | 10 | 4 (every 6 hours) |
| **B** | Every other House race (about 390) | 7 days | 8 | 0.5 (every other day, half the races each day) |
| **National** | The 6 national queries | 1 day | 15 | 8 (every 3 hours) |

**Election night (Nov 3, 6 PM to 2 AM ET):** tier A runs every 2 hours and national runs every 30 minutes.
**After Nov 4:** tier A runs daily while races are uncalled. Tier B runs weekly. National runs every 6 hours.

### 3. Running Apify (`services/news/apify-client.ts`)
- **Use the official `apify-client` package and an asynchronous run:** start the run, poll it, then read its default dataset. Don't use the synchronous run endpoint, which returns a 408 after 300 seconds and loses the run.
- **One run per tier per cycle,** with all of that tier's queries in its input. That keeps start fees to a few per day.
- **Every run caps its own cost.** Set `maxItems` and `maxTotalChargeUsd` to the smaller of the estimate (queries × results × price × 1.2) and the day's remaining budget. Check the `apify-client` docs for the exact option names in the installed version.
- **Record cost.** Store the actor ID, Apify run ID, result count, and actual cost from the run object in `IngestionRun.metadata`. A daily check compares our total with Apify's `GET /v2/users/me/usage/monthly`.
- **Save each raw dataset** as a `RawArtifact`, hashed by content.

### 4. Budget guard (`services/news/budget.ts`)
- `NEWS_DAILY_BUDGET_USD` (default **10**) and `NEWS_TOTAL_BUDGET_USD` (default **180**, which keeps $25 of the $205 in reserve). Spend is summed from `IngestionRun.metadata`.
- When a run would exceed the remaining budget, tiers are dropped in this order: **B first, then national, then A.** Each skip is logged with its reason.
- **Set a hard monthly usage limit in the Apify console too,** at $190, as a backstop in case our code has a bug.

### 5. Normalize and dedupe (`services/news/normalize.ts`, pure functions, unit-tested)
- Canonical URL: lowercase the host, drop `utm_*`, `fbclid`, `gclid`, AMP suffixes and fragments, and resolve to the publisher URL. A row with no decodable publisher URL is rejected and counted.
- `external_id` = SHA-256 of the canonical URL. It is unique per source, so a repeat sighting updates `last_seen_at` and adds the race to `search_race_keys`, and never creates a second row.
- **Same story at another link:** the same outlet domain plus the same normalized headline within 48 hours counts as a duplicate.
- **Non-news exclusion list** (`services/news/domain-rules.ts`): campaign and party sites, press-release wires, social media, video sites, and known content farms. The list is in the repo, changes by pull request, and applies the same way to every party. **Outlets are never filtered or ranked by ideology** (PLAN.md §4.6).
- Rows older than the query window, or more than 1 hour in the future, are rejected.

### 6. Agent 1, news triage (`agents/news-triage.ts`)
- **Model:** `NEWS_TRIAGE_MODEL`, default `claude-haiku-5-5`. PLAN.md §4.2 rule 7 calls for a cheap, fast model for triage.
- **Input:** batches of 20 new articles, each with its headline, snippet, outlet, publish time, and the race keys whose search found it. Each batch also gets a **candidate list from code**: the roster entries for those races, plus any race whose candidate surname or state appears in the text (simple string match). The model may only choose from that list.
- **Output (Zod, structured outputs):** for each article:
  - `races`: an array of `{ raceKey, relevance: PRIMARY | MENTIONED }`
  - `candidateKeys`
  - `eventType`: one of `DEBATE`, `AD_OR_SPENDING`, `POLL`, `FUNDRAISING`, `ENDORSEMENT`, `LEGAL_OR_ETHICS`, `POLICY`, `VOTING_ACCESS`, `CAMPAIGN_EVENT`, `RESULTS`, or `OTHER`
  - `isOpinion`
  - `isElectionNews`
- **Validation in code:** drop any race or candidate key not in the input list and count it. Articles with `isElectionNews: false` and no races are kept but never shown.
- **Logging and repeats:** each batch writes one `agent_runs` row. The same batch input is never tagged twice. Tags publish automatically, as §4.2 already allows.

### 7. Agent 10, top stories (`agents/top-stories.ts`)
- **Model:** `NEWS_PICKER_MODEL`, default `claude-opus-5-5` at effort `low`, with server-side refusal fallbacks on. Switching to `claude-sonnet-5-5` roughly halves the cost (see Costs). That choice is yours.
- **Shortlist (code):** the race's articles tagged `PRIMARY` in the last 72 hours (7 days for tier B), excluding duplicates. Score = recency decay (12-hour half-life) + 1 if the article was found by this race's own search. Keep the top 25.
- **When it runs:**
  - The picker runs only when the shortlist's hash has changed since its last run.
  - It doesn't run on races with 5 or fewer shortlisted articles. Those show the shortlist in time order, labelled **"Latest coverage"**.
  - Tier A races run at most once every 4 hours.
- **The prompt is identical for every race and party.** Pick up to 5 stories that tell a voter something new and verifiable about this race. Prefer original reporting over rewrites. Choose one representative per event, and list the other articles about that event as "also covered by." Allow at most one opinion piece, and label it. The prompt names what is **not** a factor: which outlet published the story, which party it helps, and its tone.
- **Output (Zod):** `{ picks: [{ articleId, alsoCoveredBy: articleId[], reason: NEW_DEVELOPMENT | DEBATE | POLL | MONEY | LEGAL | VOTING_RULES | RESULTS }], noneSelected: boolean }`. Code checks that every ID is in the shortlist and that no article appears twice.
- **National list:** once an hour, the picker gets the top 3 per race from tier A outputs, plus national-query articles, and returns up to 10 top stories. It uses the same schema and rules.
- **Publishing:** outputs go to `agent_outputs` as `PUBLISHED`, because they hold no free text. Each pick is an `agent_output_citations` row. The previous output for that race becomes `SUPERSEDED`.
- **Balance audit (monitoring, not enforcement):** each run records how many picks mention each candidate. The admin dashboard lists races where every pick mentions one candidate while the shortlist covers both, so an editor can look.
- **Fallback:** if the picker fails, is over budget, or is switched off, the API serves "Latest coverage" and says why.

## Schema (one additive migration; part of PLAN.md §6 batch 2)
- `articles`:
  - `id`, `source_id` (`DataSource` key `apify-google-news`), `external_id`, `url`, `canonical_url`
  - `headline`, `snippet`, `outlet`, `outlet_domain`
  - `published_at`, `first_seen_at`, `last_seen_at`
  - `search_race_keys String[]`
  - `ingestion_run_id`, `raw_artifact_id`
  - Unique `(source_id, external_id)`. Indexes on `published_at` and `outlet_domain`.
- `article_tags`:
  - `article_id`, `race_key`, `relevance`, `candidate_keys String[]`
  - `event_type`, `is_opinion`, `agent_run_id`
  - Unique `(article_id, race_key)`. Index `(race_key, relevance)`.
- `agent_outputs`:
  - `id`, `agent`, `scope_type` (`RACE`, `STATE`, `NATIONAL`), `scope_key`
  - `status` (`PUBLISHED`, `PENDING_REVIEW`, `REJECTED`, `SUPERSEDED`)
  - `payload Json`, `agent_run_id`, `created_at`
  - Index `(agent, scope_key, status, created_at)`.
- `agent_output_citations`: `output_id`, `article_id`, `rank`, `role` (`PICK` or `ALSO_COVERED`).
- `AgentKind`: add `TOP_STORIES`. This is an additive enum change.

The other batch 2 tables (`race_signal_events`, `win_probability_values`) are not needed for this plan.

## API (`routes/news.routes.ts`, behind `NEWS_INGEST_ENABLED`, cached for 5 minutes)
- `GET /api/news/races/:raceKey?limit=5` returns `{ mode: "top" | "latest" | "none", reason?, updatedAt, consideredCount, items: [{ headline, outlet, url, publishedAt, isOpinion, reason?, alsoCoveredBy: [{ outlet, url }] }] }`.
- `GET /api/news/top?state=PA` returns the national list, or one state's races merged when `state` is given.
- `GET /api/news/status` (admin only) returns spend today and to date, the last run per tier, rejected-row counts, and the balance audit.

## Frontend (`VITE_FEATURE_NEWS`)
- **"News" tab in `DetailPanel.tsx`**, next to Finance. For each item it shows the publisher's headline (linking out), outlet, time in ET, an "Opinion" label where it applies, and "Also covered by" outlets.
- **Header line:**
  - With picks: **"Top stories picked by AI from N articles · updated 10:32 AM ET · How we pick"**.
  - Otherwise: **"Latest coverage"**, or **"No recent coverage found."** Never an empty box.
- **"Top stories" card** in the monitor's lower rail, beside Biggest movers.
- **"How we pick" note:** a short methodology covering the sources, the shortlist rule, what the picker may and may not consider, and the balance audit. Every item carries the "AI-selected" badge (PLAN.md §4.2 rule 4).

## Costs

**Apify**, assuming $1–2 per 1,000 results all-in (the bake-off sets the real number):

| Period | Results per day | Per day | Period total |
|---|---|---|---|
| Bake-off, Oct 27 | about 300 | $1 | $1 |
| Oct 28 to Nov 2 (6 days) | about 5,500 | $5.50–11 | $33–66 |
| Nov 3 (election night surge) | about 14,000 | $14–28 | $14–28 |
| Nov 4 | about 8,000 | $8–16 | $8–16 |
| Nov 5 to Nov 30 | about 1,250 | $1.25–2.50 | $33–65 |
| **Total** | | | **$89–176 of $205** |

At the high end of the price range, the daily cap ($10) trims tier B on the busiest days. The total cap ($180) stops ingestion before credits run out.

**Anthropic** is a separate bill and needs an `ANTHROPIC_API_KEY` on the `api` service:
- **Triage on Haiku 5.5** ($0.10 / $0.50 per million input and output tokens): about 150 batches a day comes to about **$0.35 a day**.
- **Picker on Opus 5.5** ($4 / $20 per million): about 5,000 input and 1,500 output tokens per call is about $0.05. Up to about 300 calls a day before Nov 3 is **up to about $15 a day**.
- **Picker on Sonnet 5.5** ($2 / $10 per million): about **$7.50 a day**.

A later option is to send the tier B picks through the Message Batches API, which costs half as much and returns within hours.

## Settings (all on `api`; never in the frontend bundle)

| Variable | Default | Purpose |
|---|---|---|
| `APIFY_TOKEN` | none | Apify API token (Railway secret) |
| `APIFY_NEWS_ACTOR_ID` | none | Winner of the bake-off |
| `APIFY_PRICE_PER_1000_USD` | `2` | Used for the cost estimate before each run |
| `NEWS_INGEST_ENABLED` | `false` | Turns on ingestion and the news API |
| `NEWS_AGENTS_ENABLED` | `false` | Turns on triage and the picker (ingestion still works without it) |
| `NEWS_DAILY_BUDGET_USD` / `NEWS_TOTAL_BUDGET_USD` | `10` / `180` | Apify spend caps |
| `NEWS_TRIAGE_MODEL` / `NEWS_PICKER_MODEL` | `claude-haiku-5-5` / `claude-opus-5-5` | Models |
| `ANTHROPIC_API_KEY` | none | Shared with the §4.12 chatbot |
| `NEWS_SCHEDULER_IN_PROCESS` | `false` | Runs the job inside `api` with node-cron, for Testing, until the `cron-news` Railway service exists |
| `VITE_FEATURE_NEWS` (on `web`) | `false` | Shows the News tab and the Top stories card |

## Running it
- **Script:** `npm run sync:news` (`src/scripts/sync-news.ts`), with optional `--tier=a|b|national` and `--dry-run`. A dry run prints the queries and the cost estimate without calling Apify.
- **Schedule:** a `cron-news` Railway cron service runs `node dist/scripts/sync-news.js` every 30 minutes. It decides which tiers are due from the last successful `IngestionRun` per tier, so a missed run catches up on the next one. It holds the `news` `SyncLease`.
- **Testing environment:** until production and its cron services exist (PLAN.md §5.3), set `NEWS_SCHEDULER_IN_PROCESS=true` to run the same job from `jobs/scheduler.ts`, as FRED does.

## Commits (each passes `npm run typecheck && npm run build && npm run test:results` in `backend/`, and lint, typecheck, and build in `CODE/` where touched)

### 0. `docs(plans): news agents`
- This file, plus the PLAN.md updates (§3, §4.6, §5.4, §6).

### 1. `feat(news): articles, article tags, and agent outputs schema`
- The Prisma migration above, plus a `DataSource` seed for `apify-google-news` with attribution text.

### 2. `feat(news): Apify client, race queries, and budget guard`
- `apify-client` dependency. `services/news/apify-client.ts`, `queries.ts`, `tiers.ts`, and `budget.ts`.
- Tests: query building (including at-large seats and races with no names), tier selection from Kalshi prices, and budget skip order.

### 3. `feat(news): normalize, dedupe, and store articles`
- `normalize.ts` and `domain-rules.ts`, the `sync-news` script (ingestion only), and `npm run sync:news`.
- Tests: URL canonicalization, duplicate detection, rejection counts, and a DB test for repeat sightings.

### 4. `feat(news): latest coverage API and News tab`
- `routes/news.routes.ts` in `latest` mode only, and the News tab with its empty states.
- **This is shippable on its own:** real news on every race, with no AI.

### 5. `feat(agents): Agent 1 news triage`
- `@anthropic-ai/sdk` dependency and a small shared provider layer (`agents/run-agent.ts`). It handles the Zod structured output, the `agent_runs` write, skipping repeats by input hash, and refusal and error handling.
- `agents/news-triage.ts`. Tests use recorded fixtures, with no live calls in CI.

### 6. `feat(agents): Agent 10 top stories for each race and nationally`
- `agents/top-stories.ts`, `TOP_STORIES` in `AgentKind`, `top` mode in the API, and the Top stories card.
- Tests: shortlist scoring, ID validation, fallback to latest, and superseding.

### 7. `feat(admin): news spend and balance audit`
- An admin dashboard page that reads `/api/news/status`.

## Schedule
| When | Work |
|---|---|
| Oct 27 | Commits 1–3. Apify bake-off. Pick the actor. |
| Oct 28 | Commits 4–5. Turn on ingestion in Testing and watch spend for a day. |
| Oct 29 | Commits 6–7. Review 20 races' picks by hand before turning on `NEWS_AGENTS_ENABLED`. |
| Oct 30 | Code freeze. Turn the flags on in production once §5.3 is done. |
| Nov 3 | Election-night cadence. Check spend at 9 PM and midnight ET. |
| After Nov 4 | Lower the cadence. Add NYT and AP as sources if licensed. Agents 3 (why it moved) and 5 (daily brief) read `article_tags` and `agent_outputs`. |

## To confirm before building
- **The freeze exception.** Does the team accept shipping this after the Oct 24 feature freeze, behind flags?
- **Apify's terms and each actor's terms** on storing and showing headlines and snippets. We link out and never store article text.
- **Picker model:** Opus 5.5 (default) or Sonnet 5.5 to halve its cost.
- **An Anthropic API key and budget** for the `api` service. Apify credits don't cover model calls.
