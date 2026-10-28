# Polling data without AP

## Context
We don't have access to the AP API, so polling needs another source. Two things to know first:

- **AP was never going to give us polls.** The AP Media API in PLAN.md §4.6 is news content. The AP Elections API (§5.4) is election-night results. Neither has opinion polls. The `polls` and `poll_results` tables (DB batch 3, §6) and the "polling average" in the win probability index (§4.1) never had a source.
- **Timing.** Today is Oct 28. Feature freeze was Oct 24 and code freeze is Oct 30 (§3). Anything shipped before Nov 3 has to be small, behind a flag, and safe to leave off.

What polling feeds:
- The race page's "Polling Data Coming Soon" placeholder (`CODE/src/pages/RaceDetail.tsx`, around line 230).
- The win probability index (market + polling average + fundamentals).
- Signal divergence (Agent 4: races where odds, polls, and money disagree).
- Biggest movers (polls are listed as a future input).

## Sources

| Source | What it gives | Terms | Use it? |
|---|---|---|---|
| **VoteHub Polling API** (`https://api.votehub.com/polls`) | Individual polls as JSON: pollster, dates, sample size, population (`lv`/`rv`/`a`), and each answer's percentage. Filters for `poll_type`, `pollster`, `subject`, date range, minimum sample, and population. `GET /poll-types` and `GET /subjects` list the allowed values. | CC BY 4.0: free, attribution required. Beta, unversioned, no documented key or rate limit. | **Primary.** |
| **New York Times polling data** | The Times took over poll aggregation when FiveThirtyEight shut down (March 2025) and said the data is free to use with attribution. | Free with attribution to The Times. | **Cross-check and backup**, if it covers 2026 race polls in a downloadable form. To confirm. |
| **Manual entry (admin dashboard)** | Polls an admin types in from a pollster's release (Siena, Emerson, Quinnipiac, Marist, and so on), with the release URL. | Our own data, citing the pollster. | **Fallback** for the marquee races if a feed is missing or wrong. |
| Wikipedia polling tables | Broad race coverage. | CC BY-SA (share-alike); tables are scraped HTML that changes shape. | Cross-check by hand only, not ingested. |
| FiveThirtyEight GitHub polls | Historical polls. | Frozen since March 2025. | No (nothing for 2026). |
| RealClearPolling | Averages. | No API; terms forbid scraping. | No. |
| Third-party repackagers (pollresults.org and similar) | Copies of NYT or VoteHub data. | Varies. | No. Go to the original source. |

Known gaps in VoteHub, from people already using it:
- It doesn't mark primary polls apart from general-election polls.
- It gives candidate names but not parties.
- It doesn't include collection mode or margin of error.

The pipeline below handles each of these instead of guessing.

## Pipeline (`cron-polls`, same shape as the FRED sync)

1. **Fetch.** Every 6 hours, `GET /polls` for each Senate, House, and governor `poll_type` (confirm the exact values with `GET /poll-types`; one sample record uses `us-representative`). Save each response as a `RawArtifact` under a `DataSource` row for VoteHub, inside an `IngestionRun`. Use `SyncLease` so runs never overlap.
2. **Upsert** into `polls`, unique on (`source`, `external_id`). When VoteHub has no stable ID, build one by hashing pollster, end date, population, and race.
3. **Match each poll to a race code** (`PA-SEN`, `PA-07`, `DE-00`, `PA-GOV`) from its state, office, and candidate names, against the FEC candidates we already store. Party comes from our candidate record, never from the poll.
4. **Keep only general-election polls.** A poll counts only if its candidates match the race's general-election nominees, or its field dates end after that state's primary. Anything else goes to the review queue.
5. **Review queue.** Polls that don't match a race, have an unknown candidate, or look like a primary are kept with `status = needs_review` and shown in the admin dashboard. They are never displayed or averaged until an admin accepts them.
6. Gate the job with `POLLS_INGEST_ENABLED` (backend) and the UI with `VITE_FEATURE_POLLS` (frontend).

### Tables (DB batch 3, additive migration)
- `polls`: `id`, `source_id`, `ingestion_run_id`, `raw_artifact_id`, `external_id`, `race_code`, `pollster`, `sponsor`, `start_date`, `end_date`, `sample_size`, `population` (`LV`/`RV`/`A`), `mode` (nullable), `url`, `status` (`published`/`needs_review`/`rejected`), `fetched_at`.
- `poll_results`: `poll_id`, `candidate_id` (nullable until matched), `answer_name`, `pct DECIMAL(5,2)`.

## Polling average (code, not AI; versioned as `polls-avg-v1`)
A pure function in `backend/src/services/polls/average.ts`, unit-tested like `indicator-math.ts`:
- **Window:** polls whose field dates end in the last 30 days.
- **One per pollster:** each pollster's latest poll. Within one poll, use likely voters over registered voters over adults.
- **Weight:** `sqrt(sample_size)` times a recency decay with a 14-day half-life. Polls with no sample size get the median weight, and the methodology says so.
- **States, never a fake number:**
  - 0 polls: "No public polling."
  - 1 poll, or polls from a single pollster: show the poll(s), no average ("Too few polls for an average").
  - 2 or more pollsters: show the average, how many polls it uses, and the newest field date.
- Store every input and the method version, so each average can be recomputed.

## API and UI
- `GET /api/polls?race=PA-SEN,PA-07` returns the polls, the average (or its empty state), the method version, and attribution text. Cache for 15 minutes.
- Race page: replace the placeholder with the average and a table of polls (pollster, dates, sample and population, each candidate's share, link to the release). Footer: "Polls via VoteHub (CC BY 4.0)," plus the fetch time.
- Every number shows its source and date, as FEC and Kalshi figures already do.
- Never mix polls and Kalshi prices into one unlabeled number. The win probability index stays its own, versioned, published formula.

## Commits

### 0. `docs(plans): polling data without AP`
This file, plus PLAN.md updates (the source table, the known gaps).

### 1. `feat(polls): tables and VoteHub client`
The migration, a client with fixtures from real responses, and a matching test (name matching, the primary filter, the review queue).

### 2. `feat(polls): sync job and polling average`
The `cron-polls` job, `average.ts` with edge-case tests (0, 1, and 2+ pollsters; a missing sample size; LV and RV in one poll), and `npm run sync:polls` to run it by hand.

### 3. `feat(race-page): polls section`
The API route, and the race page section behind `VITE_FEATURE_POLLS`.

**Before Nov 3?** Commits 1–3 land after feature freeze. If they ship before the Oct 30 code freeze, limit them to Senate and governor races plus the House races with a Kalshi market inside 40–60, and default the flags to off in production until the data has been checked by hand against the pollsters' releases. Otherwise ship them after Nov 3, and leave the race page saying "No public polling" in the meantime. Don't leave "Coming soon" up.

## The other things AP was going to cover
- **News (§4.6):** run on NYT alone. The empty state becomes "No recent NYT coverage."
- **Election-night results (§5.4, §6):** the plan's fallback still holds: link to each state's official results page and show no scraped or partial totals. The paid option is Decision Desk HQ's API (quote on request, so it's probably too late for Nov 3). Scraping state results sites (many run on Clarity/Scytl) is fragile and isn't worth it this close to the election.

## To confirm before building
- Run `GET https://api.votehub.com/poll-types` and `/subjects` to get the exact Senate, House, and governor `poll_type` values, and check how many 2026 race polls each returns.
- Whether VoteHub has a rate limit or wants a contact email in the `User-Agent`.
- Whether the NYT polling data covers 2026 Senate, House, and governor polls in a downloadable form.
- Whether to ship before Nov 3 (scoped as above) or after.
