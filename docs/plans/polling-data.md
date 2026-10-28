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

## Built (Oct 28)

**Separate database.** Polls live in their own PostgreSQL database (`POLLS_DATABASE_URL`), because the main one is nearly full.
- **Schema:** `backend/prisma/polls/schema.prisma` generates `@prisma-polls/client`. Its tables are `polls`, `poll_answers`, `poll_sync_runs`, and `poll_sync_leases`.
- **Isolation:** nothing references a main-database table, and candidates are linked by FEC ID only. The sync reads candidates from the main database and writes only to the polls database, its lease included.
- **Commands:** `npm run build` and `prisma:generate` generate both clients. `prisma:deploy` (Railway's pre-deploy step) also migrates the polls database, and skips it when `POLLS_DATABASE_URL` is unset.

**Backend** (`backend/src/services/polls/`)
- **Client** (`votehub-client.ts`): calls `/poll-types` and `/polls?poll_type=`, about one request a second. The parser accepts the variations VoteHub's beta shows and skips, with a reason, any record it can't read.
- **Race matching** (`race-match.ts`): a poll is published only when two or more answers are FEC candidates in one race, no other race matches as many, and they come from at least two parties. Otherwise it waits for review with `no_race_match`, `ambiguous_race`, or `likely_primary`.
- **Sync** (`poll-sync.ts`): runs every 3 hours from the scheduler, or by hand with `npm run sync:polls`. A row is rewritten only when its content hash changes. An admin's decision is never overridden. A poll that disappears from VoteHub is hidden, unless the response came back less than half full.
- **Average** (`average.ts`, `polls-avg-v1`): as described above, with one addition: a candidate is counted once per poll.
- **API:**
  - `GET /api/polls?race=PA-SEN` and `GET /api/polls/averages?races=PA-SEN,PA-07`.
  - Both answer 503 `NOT_CONFIGURED` without the database, and 404 `NOT_LOADED` before the first sync.
  - Admin review is under `/api/admin/polls`: `review`, `status`, `:id/accept` (optionally with a corrected `raceCode`), and `:id/reject`.

**Frontend** (`CODE/src/features/polls/`, flag `VITE_FEATURE_POLLS`)
- **Race page:** a Polls section replaces the placeholder. It shows the average's lead, one bar per candidate, and a table of recent polls.
- **Monitor:** a Polls tab, plus one line on the race card with the average and a "See polls" button.
- **Empty states:** no polling, too few polls, only old polls, not connected, and not loaded each have their own wording.

**Not covered:** governor races (no FEC candidates to match against) and admin dashboard screens for the review queue (the API exists).

**Not verified against the live API.** This session couldn't reach `api.votehub.com`, so the parser was built from VoteHub's docs and sample records.
- If `/poll-types` lists no Senate or House type, the sync falls back to `us-senate` and `us-representative`, and records that in the run's `error_summary`.
- Check the first run's `poll_sync_runs` row, and the review queue, after deploying.

### Railway setup

1. In the Railway project, add a **new PostgreSQL service** for polls (for example `Polls-Postgres`).
2. On the backend service, set `POLLS_DATABASE_URL=${{Polls-Postgres.DATABASE_URL}}`. VoteHub needs no key.
3. Redeploy the backend. The pre-deploy `npm run prisma:deploy` creates the polls tables.
4. Load polls once by hand with `npm run sync:polls` (or `node dist/scripts/sync-polls.js`). After that the scheduler runs every 3 hours, at 20 past.
5. Look at `GET /api/admin/polls/status` and `/review`, accept or reject what's waiting, and spot-check a few races against the pollsters' releases.

## The other things AP was going to cover
- **News (§4.6):** run on NYT alone. The empty state becomes "No recent NYT coverage."
- **Election-night results (§5.4, §6):** the plan's fallback still holds: link to each state's official results page and show no scraped or partial totals. The paid option is Decision Desk HQ's API (quote on request, so it's probably too late for Nov 3). Scraping state results sites (many run on Clarity/Scytl) is fragile and isn't worth it this close to the election.

## Still to confirm
- The live `/poll-types` values and response shape (see "Not verified against the live API" above).
- Whether VoteHub has a rate limit or wants a contact email in the `User-Agent`.
- Whether the NYT polling data covers 2026 Senate and House polls in a downloadable form, as a cross-check.
