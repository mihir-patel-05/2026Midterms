# VoteInformed: plan, product ideas, and tech stack

Last updated: October 8, 2026
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

## 2. Where we are (as of Oct 8)

**Shipped**

- New "election monitor" frontend as the home page: a MapLibre map with state, House district, and county layers, plus Overview, Counties, and Finance tabs and global search.
- FEC candidates, committees, and detailed totals loaded through bulk sync, rate-limited to 1,000 calls per hour.
- Address-to-2026-district lookup through Geocodio, with redistricting flags on the map.
- Live Kalshi prices: one authenticated WebSocket covering about 781 markets, fanned out to browsers over SSE (`/api/prediction-markets/kalshi/stream`). Polymarket and Kalshi REST quotes come from `/api/prediction-markets` with a one-minute cache.
- Incumbent ideology scores, Gemini chat, the admin dashboard, and the researcher simulator.
- A provider-neutral election-results foundation. `/api/v1` results are served from the database read model (`RESULTS_READ_SOURCE=database`) and are currently backed only by fictional fixtures.
- Intel v2 database batch 1: `market_snapshots`, `indicator_series`, `indicator_observations`, `district_profiles`, and `agent_runs`.
- Hourly Kalshi snapshots: while the live feed is connected it writes one `market_snapshots` row per market per hour (`KALSHI_SNAPSHOTS_ENABLED`, on by default). Contest links are still null; rows carry state and district.
- Every displayed number carries its source and time: FEC figures show the date the latest report runs through, the sync date, and a link to the FEC.gov filings; Kalshi prices show the price type (midpoint or last trade) and when they last changed.

**Not done yet (carried over from Oct 1–7)**

- A market history API and sparklines over `market_snapshots`. Polymarket prices are not snapshotted yet.
- FRED economic indicator ingestion.
- District race pages with ACS demographics and partisan lean.
- Agent foundation: shared job runner, Zod output schemas, and `AgentRun` logging.

**Known gaps**

- No live election-results provider is licensed. Election night depends on getting one; see section 6.
- No outside-spending data (FEC Schedule E, issue #31).
- District boundaries: `CODE/public/geo/cd119.topo.json` has to be built (`npm run build:geo`) and committed. See `CODE/public/geo/SOURCES.md`.
- The legacy frontend (`/classic`, `features/election-dashboard/*`, `react-simple-maps`, and the `VITE_FEATURE_NEW_FRONTEND` flag) is ready to be removed.

---

## 3. Plan to November 3

| When | Work |
|---|---|
| **Oct 8–14** | **Move fully to Railway** (section 5.3). Hourly market snapshots. FRED indicators. District race pages. Agent foundation, then Agent 1 (news triage) and Agent 3 (why it moved). DB batch 2. |
| **Oct 15–21** | Win probability index and its methodology page. Agent 5 (daily brief). Biggest movers feed. Five-Minute Briefing (P01) for pilot races. Coverage and Corrections Desk minimum (P11). DB batch 3. |
| **Oct 22–24** | Agents 2 and 4. Agent 8 (Ask the race, grounded). Early vote tracker. Tipping-point races. **Feature freeze Oct 24.** |
| **Oct 25–30** | Election night mode. Agent 9. Agent 7 (data QA). DB batch 4 (`race_calls`), then a schema freeze. Load test on Railway at expected election-night traffic. Rehearse rollback and a provider outage. **Code freeze Oct 30.** |
| **Oct 31–Nov 2** | Monitoring and reviewed data corrections only. Final results-feed rehearsal. On-call schedule set. |
| **Nov 3** | Election night. Scale the API up, keep the results ingestor at exactly one replica, and fall back to official state result links for any race whose feed is unhealthy. |
| **After Nov 3** | Agent 6 (candidate positions), polarization and democratic-institutions indexes, post-election product ideas (section 4.3), and Phase 2 (section 4.4). |

---

## 4. Product ideas

### 4.1 Intel v2 features (pre-election)

| Feature | What it is |
|---|---|
| **District race pages** | Every House, Senate, and governor race on one page: candidates, the incumbent's record and ideology, partisan lean, 2024 presidential margin, ACS demographics, FEC cash on hand and receipts, odds history, a polling average or "No public polling," and top local issues. |
| **Market history** | Hourly Kalshi and Polymarket snapshots with sparklines, volume, and liquidity. |
| **Win probability index** | A published formula that blends market prices, the polling average, and fundamentals (lean, incumbency, money ratio). Versioned methodology, computed in code, and every input stored so a value can be recomputed. |
| **Economic indicators** | 10-year and 2-year Treasury yields, yield curve, S&P 500, VIX, gas prices, CPI, and unemployment, shown next to generic-ballot and chamber-control odds. |
| **Biggest movers** | The races where odds, polls, or money moved most over 24 hours or 7 days, each linked to its "why it moved" explanation. |
| **Tipping-point races** | A Monte Carlo simulation over win probabilities that finds the seats most likely to decide House and Senate control. |
| **Early vote tracker** | Ballots returned by party registration, in states that publish the data. |
| **Election night live mode** | Results, called and uncalled counts, and live odds per race. Browsers poll every 15–30 seconds; Kalshi stays on SSE. |

### 4.2 AI agents

Agents are the analyst layer, not the data layer. Each agent is a job made of a prompt, a Zod schema, and a database write. We are not using an agent framework.

| # | Agent | Output | Cadence |
|---|---|---|---|
| 1 | News triage | Tags each article with races, candidates, issue, event type, and relevance | Every 15–30 min |
| 2 | District issues | Top issues per district, with sources | Daily |
| 3 | Why it moved | A cited explanation of a signal event, or "no clear cause found" | Event-driven |
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
| `cron-*` | Railway cron services running `backend/` jobs | FEC sync, ideology sync, FRED, ACS, and the agent jobs. Each is a one-off run that exits when done, so jobs never run inside API replicas. `SyncLease` prevents overlapping runs. |
| `results-ingestor` | `backend/` worker, **exactly 1 replica** | Election night only. Polls the licensed provider, writes append-only `ResultSnapshot`s, and calls `publishSnapshot()`. Voter requests never trigger a call to the provider. |
| `bucket` | Railway Bucket (S3-compatible) | Raw provider payloads (`RawArtifact`, keyed by content hash) and large geo assets. |

**Election-night scaling:** `api` scales horizontally because it only reads, and public reads are cached. `market-feed` and `results-ingestor` stay at one replica each.

### 5.3 Migration checklist (Oct 8–14)

- [ ] Create `staging` and `production` environments in the Railway project. Use Railway private networking (`api.railway.internal`) between services.
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
| FEC OpenFEC API and bulk files | Candidates, committees, finance | `FEC_API_KEY` (1,000 calls/hour) |
| Kalshi REST and WebSocket | Live market prices | `KALSHI_LIVE_ENABLED`, `KALSHI_API_KEY_ID`, `KALSHI_PRIVATE_KEY` |
| Polymarket Gamma | Market prices | public |
| Geocodio | Address to 2026 district | `GEOCODIO_API_KEY`, `GEOCODIO_DAILY_LOOKUP_LIMIT` |
| GovTrack and unitedstates/congress-legislators | Ideology, incumbents | `IDEOLOGY_*` |
| Census (cartographic boundaries, ACS) | Maps, demographics | public. See `CODE/public/geo/SOURCES.md` |
| FRED | Economic indicators | to add |
| RSS and news APIs | Agent 1 input | to add |
| AP Elections API or Decision Desk HQ | Election-night results | **not licensed yet**; see section 6 |
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
| 2 | Oct 8–14 | `articles`, `article_tags`, `agent_outputs` (with review status), `agent_output_citations`, `race_signal_events`, `win_probability_values` |
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
