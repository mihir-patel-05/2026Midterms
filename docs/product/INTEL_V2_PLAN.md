# VoteInformed Intel v2: election intelligence plan

Last updated: October 1, 2026
Status: Proposed
Election day: November 3, 2026

## 1. Positioning

General dashboards such as [World Monitor](https://www.worldmonitor.app/) cover the whole world at the country level: a map, AI news briefs, market tickers, and a country instability index. They do not cover U.S. races, districts, polling, campaign finance, or voters.

VoteInformed should not compete on breadth. It should go deep on U.S. elections, down to each district and each voter.

> World Monitor shows you the world. VoteInformed shows you every race, every dollar, and every market, and explains what moved.

Differentiators:

1. **District-level depth.** One page per race combines market odds over time, polls, FEC money, outside spending, the incumbent's record, and local news.
2. **Explanation of movement.** When odds move, the site says why, with sources.
3. **Disagreement detection.** It flags races where markets, polls, and money disagree.
4. **A voter-facing layer.** Users find their races, candidates, records, funders, and deadlines. General dashboards serve analysts only.
5. **Election night.** Live results, race calls, and odds update together per district.
6. **Trust.** Every number has a source, a timestamp, and a methodology. AI content is labeled.
7. **Scenario modeling.** The existing researcher simulator becomes "what if turnout shifts 3 points in X?"

Out of scope for now:

- Europe, NATO, and G7 dashboards. General dashboards already cover them well.
- "Likelihood of socialism" and "likelihood of fascism" indexes. The terms have no agreed, measurable definition, and the indexes would conflict with the nonpartisan principles in `feature_roadmap.md`. A democratic-institutions tracker based on established datasets covers the same concern (see section 4.4).

## 2. Existing foundation

- District and county map layers (MapLibre).
- FEC finance totals, committees, receipts, and disbursements.
- Incumbent ideology scores.
- Live Kalshi and Polymarket quotes by national, state Senate, and House district scope (`docs/PREDICTION_MARKETS_IMPLEMENTATION.md`). Quotes are cached for one minute and are not stored.
- Gemini chat integration.
- Railway cron jobs, Prisma, and PostgreSQL.
- The provenance design in `feature_roadmap.md` section 4.3.

## 3. Features

### 3.1 District race pages

Each House district, Senate race, and governor race gets a page with:

- Incumbent, candidates, and the incumbent's voting record and ideology.
- District partisan lean, 2024 presidential margin, and census demographics from the ACS API.
- FEC cash on hand and receipts per candidate. Outside spending comes from issue #31.
- Market odds with history (3.2).
- A polling average where public polls exist. Otherwise the page shows "No public polling."
- Top local issues and news (Agent 2).

### 3.2 Prediction market history

Store hourly Kalshi and Polymarket snapshots per market. Show probability-over-time sparklines and include volume and liquidity. Label values as "market price," not "forecast."

### 3.3 Win probability index

A published formula blends market prices, the polling average, and fundamentals (partisan lean, incumbency, and money ratio). The weights and inputs are documented on a methodology page. The index is computed in code, not by an AI model.

### 3.4 Election-relevant economic indicators

From FRED and a market data source: 10-year and 2-year Treasury yields, the yield curve, S&P 500, VIX, gas prices, CPI, and unemployment. Show them next to the generic ballot and House or Senate control odds, not as a general ticker.

### 3.5 Biggest movers feed

The races where odds, polls, or fundraising moved most in the past 24 hours or 7 days. Each entry links to the "why it moved" explanation.

### 3.6 Election night live mode

AP or state results feeds, called and uncalled counts, and live odds per race. It must be load-tested before November 3.

### 3.7 Tipping-point races

A Monte Carlo simulation over win probabilities that finds the seats most likely to decide House and Senate control.

### 3.8 Early vote tracker

Ballots returned by party registration, in states that publish the data.

## 4. AI agents

### 4.1 Role

AI agents are the analyst layer, not the data layer. Hard numbers (odds, FEC money, polls, votes, yields) come from APIs and deterministic code. Agents do three things:

1. Read unstructured text.
2. Connect events to numeric changes.
3. Explain both in plain language with citations.

If a value can be fetched from an API, it should not come from an agent.

### 4.2 Agent catalog

| # | Agent | Input | Output | Cadence |
|---|---|---|---|---|
| 1 | News triage | RSS, local papers, Google News, news APIs | Article tags: race(s), candidates, issues, event type (poll, ad, scandal, endorsement, debate), relevance | Every 15–30 min |
| 2 | District issues | 30 days of tagged articles per district | Top issues per district with linked sources | Daily |
| 3 | Why it moved | Trigger: odds move > X pts, new poll, large FEC filing, or outside spend. Context: 48h of tagged news | A cited explanation, or "no clear cause found" | Event-driven |
| 4 | Signal divergence | Odds, poll average, money ratio per race | Flags races where the signals disagree, with an explanation | Daily |
| 5 | Daily brief | Outputs of agents 1, 3, and 4 | Top national stories, biggest movers, races to watch | Each morning |
| 6 | Candidate positions | Campaign sites, debate transcripts, press releases | Positions by issue with a quote and link, or "no stated position" | Weekly and after debates |
| 7 | Data QA | New or changed records | Anomaly flags: duplicates, broken links, odd prices | Each sync |
| 8 | Ask the race | User question plus stored data and articles | An answer grounded only in stored data, with citations | On demand |
| 9 | Election night | Results feeds and wire stories | Live race notes and summaries of why each race was called | Election night |

### 4.3 Rules

1. **Extract and cite, don't invent.** Each claim must reference a stored source. Otherwise the agent returns "not found." Output is structured JSON validated with Zod.
2. **Agents never produce displayed facts or index values.** Indexes are formulas. Agents may contribute labeled inputs, such as a news-tone component.
3. **Symmetric treatment.** All parties get the same prompts and rules. Test fixtures check that equivalent events are tagged the same way regardless of party.
4. **Provenance.** Store the model, prompt version, inputs, output, and timestamp for every run (`AgentRun`).
5. **UI labeling.** AI content has an "AI summary" badge and links to its sources.
6. **Human review.** Candidate positions and claims about named people go through the admin review queue before publishing. Tags and briefs can publish automatically.

### 4.4 Indexes after the election

- **Polarization index.** Based on the DW-NOMINATE party gap, party-line vote share, affective polarization (Pew and ANES), and split-ticket districts. A labeled AI news-tone component is optional.
- **Democratic institutions tracker.** Based on V-Dem, Freedom House, Bright Line Watch, court compliance, and election-administration changes.

Both need a published methodology and should not be rushed before the election.

### 4.5 Architecture

```
Railway cron / event triggers
  -> ingest (deterministic: Kalshi, Polymarket, FEC, FRED, RSS) -> Postgres
  -> agent jobs (LLM + structured output)                        -> Postgres (with sources)
  -> admin review queue (sensitive outputs only)
  -> API -> race pages, brief, movers feed, chat
```

- No agent framework at first. Each agent is a job made of a prompt, a Zod schema, and a database write. Agent 3 is the only one that gathers extra context.
- Use a cheap, fast model for high-volume triage and a stronger model for "why it moved," the brief, and chat. Each article is tagged once and the tags are cached.
- Proposed models: `Article`, `ArticleTag`, `AgentRun`, `RaceSignalEvent`, `MarketSnapshot`, `AgentOutput` (with a review status).

### 4.6 What agents must not do

- Predict winners.
- Score ideology-laden "likelihood" indexes.
- Decide which news matters by ideology.
- Write about a candidate without a source.

## 5. Timeline

| When | Work |
|---|---|
| Oct 1–7 | District race pages (static data), market snapshot history, economic indicators, agent foundation |
| Oct 8–14 | Agent 1 (triage), Agent 3 (why it moved), win probability index, Agent 5 (daily brief) |
| Oct 15–24 | Biggest movers, Agents 2 and 4, Agent 8 (grounded chat), early vote tracker, tipping-point races |
| Oct 25–Nov 3 | Election night live mode, Agent 9, load testing, Agent 7 (data QA) |
| After Nov 3 | Agent 6 (candidate positions), polarization and institutions indexes, Phase 2 |

## 6. Phase 2: Elections Monitor

After November, extend into other elections rather than general geopolitics: 2027 governor races, the 2028 primaries, and major foreign elections (a global elections calendar). A G7 comparison view can follow later, focused on elections and government approval.
