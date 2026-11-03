# Live election results from civicAPI

## Context
No live results provider is connected (PLAN.md §2, "Known gaps"). AP has not answered our requests for the AP Elections API. Decision Desk HQ sells API access only through its sales team, at an unpublished price. On Oct 29 we chose **civicAPI** for election night.

What civicAPI is, from its own FAQ and docs:
- A **free** results API at `https://civicapi.org/api/v2`. It needs no key or sign-up and returns JSON or CSV.
- **Commercial use is allowed.** Projects that are not personal must credit it, with a link to civicapi.org or its name.
- It **aggregates results from secretaries of state** and state and county election boards. For some small elections it uses local media reports.
- During live elections it **updates every 5–10 seconds**.
- There is **no SLA, no uptime guarantee, and no published rate limit.**

This plan connects civicAPI to the results pipeline that already exists (`backend/src/features/election-results/`). Live U.S. Senate and House totals then appear on race cards on Nov 3, with county detail for the closest races.

**Timing.** Today is Oct 29. The code freeze is Oct 30 (PLAN.md §3), so this work needs an explicit exception to the freeze. Everything ships behind flags that are off by default. Phase 1 (statewide and district totals for every race) is useful on its own, so it can ship even if county detail slips.

**This changes a PLAN.md rule.** PLAN.md §6 says a provider needs "a signed contract that confirms coverage, redistribution rights, rate limits, and support". It also says that without a licensed provider "the site links to official state results and does not show scraped or partial totals." civicAPI has published terms, not a contract. This plan replaces that rule for civicAPI and keeps the official-results links as the fallback. The same "link out only" guidance in `docs/plans/polling-data.md` and in the War Room plan's Phase 4 (`docs/plans/war-room-frontend.md`) is superseded for civicAPI too.

**Other plans this touches:**
- **War Room.** Its Election night screen already reads `/api/v1`, so it gets civicAPI results with no screen changes, as that plan intended. War Room code merges only into `Frontend_testing` and is off in production, so on Nov 3 voters see live results in the current monitor (`/`) only.
- **The Oct 29 database move (PLAN.md §5.5).** Testing now runs on the new, empty `Third_database` (5 GB). The catalog needs the `counties` table and the FEC candidates loaded again first, and results must fit in the space left (see "Database size").

Decisions this plan makes (change them before building if you disagree):
- **civicAPI is the only results source on Nov 3.** Its `DataSource` type is `OTHER`, not `LICENSED_PROVIDER` or `OFFICIAL_STATE`, because it is an aggregator. The UI names it every time it shows a number.
- **Senate and House only:** 35 Senate races and 435 House races. Governor races are out of scope for v1. We have no candidate data for them, and the monitor has no governor filter.
- **No race calls in v1.** civicAPI marks some candidates as winners. We keep that flag in the raw payloads but never show it as a call. The UI says "Leading", never "Won", until `race_calls` exists (PLAN.md §6, batch 4).
- **civicAPI's percent reporting is an estimate.** Its FAQ defines it as the estimated share of precincts or ballot batches that have reported. We show it as "about X% of the expected vote counted (civicAPI estimate)", never as "% of precincts". We never turn it into precinct counts.
- **Browsers never call civicAPI.** One worker polls it and writes through `RawArtifact` → `ResultSnapshot` → `publishSnapshot()`. The `/api/v1` read model serves the stored results.

## Built (Oct 31)
Everything below is built, on the War Room only (the user's call: every election-night item lives in the War Room). Where the build differs from the plan, the build wins:

- **civicAPI was reachable from here on Oct 31** and is serving **test data** (`test_data: true`, moving numbers, and calls). The field names in this plan were confirmed against live responses; recorded fixtures are in `backend/src/features/election-results/civicapi/fixtures/`.
- **Race calls are in v1.** civicAPI's FAQ says its own decision desk makes its calls ("civicAPI uses its own decision desk"), so `winner` is a projection by a named desk. Calls go to the new `race_calls` table (append-only; a call missing from two documents in a row is retracted, never deleted) and are labelled "civicAPI decision desk" everywhere, never as certification. `advanced` is stored as a runoff call. Detail documents carry `called_at`; for tier B races one detail request fetches it after the call appears (until then the time is "first seen", marked with *).
- **Test data is held back.** The ingestor publishes nothing while civicAPI says `test_data: true`, and the source shows "civicAPI is serving test data". `CIVICAPI_ACCEPT_TEST_DATA=true` (Testing only) stores it with `is_test_data` and the API serves it with a loud TEST DATA label; the first live document deletes every test-data snapshot and call automatically.
- **No catalog script.** The ballot sync (Oct 30) already writes the `civicapi` source, the event, one contest per race (`sourceContestId` = `election_id`) and every candidacy with civicAPI's ids, so the ingestor uses those. County geography (`counties-fips`) is created as counties first report.
- **Tier A is chosen when the ingestor starts**, from Kalshi snapshots (leader under 80¢, closest first, at most 60), or from `CIVICAPI_TIER_A_RACES`. No `tier-a.json`. A tier A race whose detail fails three times in a row drops to the aggregate for the rest of the run. Since Nov 2 the prices are the latest hour at or before `CIVICAPI_TIER_A_AS_OF` (default Nov 2, 12:00 UTC), so every restart picks the same races (see "Review (Nov 2)").
- **Bug fixed on the way:** the ballot sync stores ballot order from 0, which the contract rejects, so every civicAPI contest would have been withheld. The read model now serves positions from 1.
- **Measured on Oct 31** against live civicAPI test data, all 470 races: the first cycle published 470 snapshots; later cycles publish only what changed (40–70 races). `/api/v1/bootstrap?units=none` is 1.5 MB raw and 158 KB gzipped (compression is on for `/api/v1`), built in about 0.5 s and cached 10 s.
- **Where it shows (War Room):** the Night screen (status banner, seats called and leading, call log, a results board of every race, key races, live coverage), a **Results** lens on the map, a Results section on every race dossier (counties for tier A), and a header chip. Official state results links (`CODE/public/data/state-results-links.json`) appear whenever the feed is delayed, switched off, or not connected. The links could not be opened from the build sandbox: run `npm run check:results-links` in `CODE/` and open each before Nov 3.
- **Running it:** `npm run results:ingest` (or `node dist/workers/results-ingestor.js`) with `RESULTS_INGESTOR_ENABLED=true`; `--once`, `--record <dir>` and `--replay <dir>` as planned. On Testing, `RESULTS_INGESTOR_IN_PROCESS=true` runs it inside `api` (one replica only).

## Review (Nov 2)
A pre-election review of the pipeline, against live civicAPI and the Railway projects.

**Verified:**
- **civicAPI** answers. It still serves **test data** (`test_data: true`, last updated Nov 2 08:23 UTC), with every race at 100% and called. It sends no ETags, and Cloudflare caches each response for 15 s.
- **IDs are stable.** Both aggregate IDs, all 470 `election_id`s, and every candidate id match the Oct 31 recording. The parser reads today's payloads with no issues. The GA-SEN detail has 159 counties.
- **Local rehearsal.** On a fresh database, the real ballot sync and ingestor ran against live civicAPI:
  - With test data held, nothing published and the source said why.
  - As a rehearsal, 470 races published with 0 errors, in about 26 s.
  - Then a live night made from today's payloads was replayed. Test data was purged, all races published, and a call was made and then retracted after two documents.
  - `/api/v1/bootstrap?units=none` is 1.4 MB, or 140 KB gzipped. It takes 0.5 s cold and 0.05 s cached.
  - The kill switch answered 503 within 10 s and recovered. A dead host turned the source `UNAVAILABLE` after 3 cycles.
- **Testing's ballot sync** runs every 6 hours: 470 races, 1,236 candidates, 1,166 matched to FEC. The 5 delegate seats (DC, AS, GU, MP, VI) are not in civicAPI. AK-SEN lists "Dan Sullivan" and "Daniel J. Jr. Sullivan" under two civicAPI ids; both are kept, so watch that race.

**Found in Railway (Nov 2, 13:00 UTC):**
- **Testing `Backend` has no results variables.** It runs `2026Midterm_intel_v2` at `a3c35e83`, but `FEATURE_ELECTION_DASHBOARD`, `RESULTS_PROVIDER_ENABLED_IDS`, `RESULTS_INGESTOR_ENABLED` and `RESULTS_INGESTOR_IN_PROCESS` are all unset. The ingestor has never run there (no `[civicapi]` log line), `/api/v1` answers 404, and the Nov 1 rehearsal did not happen on Testing.
- **There is no `results-ingestor` service.** Run the loop inside Testing's single-replica `Backend` with `RESULTS_INGESTOR_IN_PROCESS=true`. Payloads then go to the container's disk, which is lost on redeploy. They are an audit copy only; every number is in Postgres.
- **`main-prod` is not ready.** It runs `main` from Oct 30, which has no civicAPI ingestion and no live results, and its `Frontend` has no `VITE_FEATURE_WAR_ROOM`. Election night runs on Testing (`2026midterms-testing.up.railway.app`) unless `main-prod` gets `2026Midterm_intel_v2` merged to `main`, every variable below, a ballot sync, and a rebuild of `web`.
- **The source starts switched off.** The ballot sync creates `civicapi` with `is_enabled = false`, and no admin control exists. Switching it on, and the kill switch, are SQL against the Testing database.

**Fixed (Nov 2):**
- **Tier A no longer changes on restart.** It is chosen from Kalshi prices at a fixed time (`CIVICAPI_TIER_A_AS_OF`). Every variable change restarts `Backend`, the database-size brakes included. Before this fix, a restart on the night re-chose from prices of the night. Settled markets dropped close races from county detail, and races newly in tier A were rejected as "older than the race's current snapshot". That turned the source `DEGRADED`, and the War Room showed "Some races failed validation".
- **A race that changes tiers is a warning, not a failure.** It keeps its current numbers and logs a warning; it publishes again when the race next changes.
- **NBC News's video** `b043z24ErQk` is on the Live coverage panel (migration `20261102120000`), unless an admin already set NBC.

**Checklist, Nov 2.** Every change happens at once, in one restart. Switching on now is safe: while civicAPI serves test data nothing publishes, and the War Room shows "civicAPI waiting".
1. **Testing `Backend` variables:**
   - `FEATURE_ELECTION_DASHBOARD=true`, `RESULTS_PROVIDER_ENABLED_IDS=civicapi`, `RESULTS_INGESTOR_ENABLED=true` and `RESULTS_INGESTOR_IN_PROCESS=true`.
   - `BALLOT_SYNC_ENABLED=false`. The catalog is complete; left on, the sync runs at 6:40 PM ET on the night and 2 minutes after every restart.
   - `CIVICAPI_CONTACT=<email>`.
   - Leave `CIVICAPI_ACCEPT_TEST_DATA` unset. Testing is the public site, so a rehearsal there would show TEST DATA to visitors. The rehearsal above was run locally instead.
2. **Testing database:** `UPDATE data_sources SET is_enabled = true WHERE key = 'civicapi';`
3. **Check the result.**
   - `Backend` logs show `[civicapi] Results ingestor started` and then `[civicapi] held: civicAPI is serving test data…` every 30 s.
   - `/api/v1/sources/status` shows `NOT_CONFIGURED` with that message.
   - The War Room header shows "civicAPI waiting".
4. **Merge and deploy** this change to Testing (the tier fix and NBC). Admin > Live coverage: check NBC, and paste the other networks' links.
5. **Official links.** Open each link in `CODE/public/data/state-results-links.json` by hand, then set `checkedAt`. The build sandbox could not reach state sites or YouTube.

**On the night**, nothing needs switching on.
- **When civicAPI goes live:** its first live document publishes every tier B race at 0 (`ok: N published`). County-detail races follow within a cycle or two.
- **If it still reports test data after 7 PM ET:** nothing publishes, and the War Room says so. Contact civicAPI; the official links stand in meanwhile.
- **Restarts:** the lease is taken per cycle. If a restart kills a cycle midway, the lease expires after 90 s, so results can pause for up to about 2 minutes. The last numbers stay on screen.

## Check (Nov 3)
A last check at 16:45 UTC (11:45 AM ET) on election day, against live civicAPI and Testing.

**Verified:**
- **civicAPI is live.** Both aggregates say `test_data: false`. Every race is at 0 votes and 0% with no calls, and detail documents carry today's `last_updated` (GA-SEN 16:44 UTC). Most answers take 1–2 s. Testing logged one 502 on the Senate aggregate (16:32 UTC); the next cycle succeeded.
- **Testing's ingestor** (inside `Backend`, deployed 15:40 UTC) runs every 30 s with 0 rejections. The 418 tier B races come from the aggregates, and the 52 tier A races (the `CIVICAPI_TIER_A_AS_OF` list) are refreshed every 10 minutes. The War Room's `/api/v1/bootstrap` answers 200 in about 0.35 s, and 304 to ETags. The ballot sync is off.
- **Early vote** reads civicAPI's Nov 3 documents. A few state documents answered 502 or timed out; each keeps its last good document and is read again on the next sweep.
- **Tests:** `test:results` passes 255 (3 polls tests skip without a polls database). In `CODE/`, lint, typecheck, build, and 297 tests pass. A local rehearsal (fresh database, the real ballot sync, one live cycle) published all 470 races with 0 errors.

**Found:** both aggregates' `last_updated` still read **Oct 23, 15:37 UTC**, while detail documents are current. Every tier B snapshot took that as its "as of" time, so 418 races would show "As of 11:37 ET" all night if it does not move. A race moving from detail to aggregate never published again, because its aggregate document was always "older" than its last detail. That happens after 3 failed details in a row, or with `CIVICAPI_TIER_A_ENABLED=false` (the 4.5 GB brake, which would have frozen all 52 tier A races).

**Fixed (Nov 3):**
- An aggregate snapshot is stamped with the cycle that first saw its numbers, within 30 s of the change. Detail snapshots keep the race's own `last_updated`.
- civicAPI's `last_updated` stays on the raw artifact. An aggregate older than the one behind a race's current snapshot is still rejected as a stale copy.
- A race moving from detail to aggregate publishes at its next change.
- Test: `ingest.db.test.ts`, "aggregates whose last_updated stands still…". It fails on the old code for both the "as of" time and the brake.

**Still open:**
- **`main-prod`** runs `main` at `42d795c0` (Nov 2) without the ingestor (no `[civicapi]` cycles today), and its ballot sync still runs every 6 hours. Election night runs on Testing, as decided on Nov 2.
- Deploying this fix restarts `Backend`, so results pause for up to about 2 minutes (see "Restarts" above). Before polls close at 6 PM ET, nothing is lost.

## What already exists
- **Contracts** (`contracts.ts`, version `1.0.0`): `ContestResult`, `ReportingProgress`, `SourceStatus`, and the rules that keep mock and live labelling consistent.
- **Parser interface** (`parser.ts`): `ElectionResultsParser`, taking a `RawResultsDocument` and returning `ParsedResultsBatch`. No live parser exists yet.
- **Publishing** (`publication.ts`): `publishSnapshot()` only publishes a snapshot with a validated artifact, votes, and metrics. It rejects a snapshot whose `sourceUpdatedAt` is older than the current one.
- **Read model** (`read-model.ts`): serves any source that has `isEnabled = true` and is listed in `RESULTS_PROVIDER_ENABLED_IDS`. It marks a source `STALE` after `max(2 × expectedCadenceSeconds, RESULTS_STALE_AFTER_SECONDS)`.
- **Routes** (`routes/results-v1.routes.ts`): `GET /api/v1/bootstrap`, `/contests/:id/results/current`, and `/sources/status`, with ETags. They are gated by `FEATURE_ELECTION_DASHBOARD`.
- **Tables:** `DataSource`, `ElectionEvent`, `Contest`, `Person`, `Party`, `Candidacy`, `ReportingUnit`, `GeographyVersion`/`GeographyUnit`, `IngestionRun`, `RawArtifact`, `IngestionError`, `ResultSnapshot`, `CandidateVote`, and `ContestMetric`. **No migration is needed.**
- **Settings already in `env.ts`:** `RESULTS_PROVIDER_ENABLED_IDS`, `RESULTS_POLL_INTERVAL_SECONDS` (30), `RESULTS_STALE_AFTER_SECONDS` (300), and `RESULTS_PARSER_VERSION`.
- **Other pieces:** `SyncLease` (`services/sync-lock.service.ts`), the `counties` table (5-digit FIPS, from `npm run seed:counties`), and race keys (`raceKey()` in `services/kalshi/catalog.ts`: `PA-SEN`, `PA-07`, `DE-00`).

**Gaps this plan fills:**
1. **No live ingestion.** `fixture-ingestion.ts` only replays the fictional fixture.
2. **The contract can't carry percent-only progress.** `ProgressCountSchema` forces `percentage` to null when the source gives no counts, and `toProgress()` follows that rule. civicAPI gives a percentage and no counts.
3. **No county FIPS.** The read model takes `countyFips` from a linked `GeographyUnit`, and none exist for real counties.
4. **The frontend can't match candidates.** `RaceCard` matches results to FEC candidates by ID (`resultById`). Results carry `Person` IDs, so nothing would match.
5. **The frontend only loads mock results.** `useMockResultsFeed` and `loadMockDashboard` (which rejects any contract other than `"1.0.0"`) are the only loaders. `RaceCard` says "% of precincts reporting".
6. **Raw artifacts go to the local filesystem** (`.local/raw-artifacts/`). On Railway that storage is wiped on every deploy.

## Built ahead of this plan: the general election ballot (Oct 30)
The ballot part of the catalog (step 1 below) shipped first, because the monitor showed FEC filers instead of who is on the ballot: CA-07 has two Democrats in the general, and one was missing.
- **`backend/src/services/ballot/`**: `civicapi-ballot.ts` parses both aggregates; `ballot-sync.ts` writes one `Contest` per race (`legacyElectionId` set) and one `Candidacy` per candidate (`ballotStatus BALLOT_CONFIRMED`, ballot order, party). Candidates are matched to FEC records by surname, then first initial, never across major parties, and each matched FEC filing is marked `CONFIRMED` on its race. Candidates with no FEC record are kept, with no FEC link.
- **Guards:** nothing is written if either aggregate has under 90% of the races on the ballot (`utils/races.ts`). Placeholder rows such as "Write-ins" are dropped. A candidate who leaves the ballot is deleted, or marked `WITHDRAWN` once votes exist.
- **After the first Testing run (Oct 30):** 1,248 candidates in 470 races, 1,152 matched to FEC. Follow-ups:
  - Declared write-ins (party "Write-In") are stored as `WRITE_IN` with no party, kept off the ballot list, and listed separately in the log.
  - Each unmatched candidate's log line says why: no filer with that surname in the race, filers sharing the surname, a party conflict, or a record already matched.
  - A candidate with no same-surname filer in their race is matched to a same-state, same-chamber filing under another district number (as after a redraw) when the surname and first initial agree and the major parties don't conflict. These are logged as cross-district matches.
  - Two names in one race that could be one person ("Dan Sullivan", "Daniel J. Jr. Sullivan" in AK-SEN) are flagged as an issue and both kept.
- **After the second Testing run:** the match reasons showed FEC holding two records for one person (`HARRIS, MARK E` twice, `MENENDEZ, ROBERT` and `MENENDEZ, ROBERT J.`), and two nominees missing from our FEC data entirely (Nick LaLota, Ashley Hinson). Now:
  - Matching runs in two rounds per race. Round 1 takes a surname only one FEC person has (one record, or duplicates under one name) when no one else on that ballot shares it, else an exact first name. Round 2 takes a first name or nickname match (Bob/ROBERT, Rob/ROBERT J., Mitch/MITCHELL) among the records left. Among several records the best funded this cycle wins, and each such pick is logged.
  - Major-party candidates with no record of their surname in the state are searched in OpenFEC by surname, state and chamber (at most 60 a run, only with `FEC_API_KEY`). A match on surname, first name or nickname and party is saved with its totals and confirmed on the race; later runs find it through that link without searching again. A dry run searches but writes nothing.
- **After the third Testing run:** 1,164 of 1,236 matched. Surnames now compare in every form (`sharesSurname`): each word of a multi-word FEC surname ("HINSON ARENHOLZ"), the words run together ("ST CLAIR" and "StClair"), the last two words of a ballot name ("Demirci Lopez"), and a maiden name kept as a middle name when the first names agree.
- **Schedule:** every 6 hours, 2 minutes after boot, and after each FEC sync (`BALLOT_SYNC_ENABLED`, default on). `npm run sync:ballot` is a dry run; add `-- --apply` to write.
- **Reads:** `/api/elections/states/:state` and `/api/elections/:id` include `normalizedContest.candidacies`. The monitor, War Room and race pages show exactly the ballot when it is on file, and every FEC filer until then.
- **Still to confirm against a live response:** the field names below. The sync logs each unexpected region or candidate as an issue.

## civicAPI endpoints we use
The field names below come from the open-source TUTV election-night app ([bentonraymer/electionsmap](https://github.com/bentonraymer/electionsmap), `server/civic.ts`). It polls civicAPI for the 2026 midterms, and its race catalog was generated on Oct 26. **We could not reach civicapi.org while writing this plan.** Confirm every field against a live response on day 1 (see "To confirm").

| Endpoint | What it returns | Our use |
|---|---|---|
| `GET /race/87528` | The **Senate aggregate**. `region_results` is keyed by lower-case state (`pa`). Each region has `election_id`, `name`, `percent_reporting`, and `candidates`. | Catalog, change detection, and totals |
| `GET /race/87524` | The **House aggregate**. Keys look like `pa-07` and `ak-al`. Each region has the same fields as above. | Catalog and the totals for tier B races |
| `GET /race/{id}` | **One race.** Fields: `percent_reporting`, `last_updated`, `polls_close`, `candidates`, and `region_results` (counties, with `name`, `fips`, `percent_reporting`, and `candidates`). | County detail for tier A races |
| `GET /race/search?query=&limit=&offset=` | `races[]` with `id`, `election_name`, `type`, `province`, `election_date`, `percent_reporting`, and `candidates` | Checking the aggregate IDs, and finding a past race for tests |
| `GET /status` | Service status (shape unconfirmed) | Optional health probe |

**Candidate fields:** `candidate_id` (sometimes missing), `name`, `party` (a full name such as "Democratic"), `votes`, `percent`, `incumbent`, and `winner`. County candidates have no `candidate_id`, so they are matched by name and party.

**The aggregate IDs `87528` and `87524` go in settings, not in code.** The catalog script checks them through `/race/search` before every run.

### Field mapping
| civicAPI | Ours |
|---|---|
| aggregate key `pa-07` / `ak-al` / `pa` | `Contest.stateCode` `PA`, `districtCode` `07` / `00` / null; race key `PA-07` / `AK-00` / `PA-SEN` |
| `election_id` (aggregate) or race `id` | `Contest.sourceContestId` |
| `candidate_id`, or else `name:<normalized name>\|<party code>` | `Candidacy.sourceCandidateId` |
| `name`, `party` | `Person.displayName`/`normalizedName` and `Party` (`D`, `R`, `I`, `L`, `G`, other) |
| `votes` | `CandidateVote.votes` (`TOTAL`) |
| `percent` | `CandidateVote.sourceVotePercentage` |
| `percent_reporting` | `ContestMetric.reportingPercentage`, with the precinct and unit counts left **null** |
| sum of candidate votes | `ContestMetric.votesCounted` |
| `last_updated` | `RawArtifact.sourceUpdatedAt`; `ResultSnapshot.sourceUpdatedAt` for detail documents. Aggregate snapshots take the cycle time instead (see "Check (Nov 3)") |
| `region_results[*].fips` | a county `ReportingUnit` linked to a `GeographyUnit` |
| `winner` | kept in the raw artifact only (v1) |

## Pipeline
```
results-ingestor (1 replica) ─► every 30 s: Senate + House aggregates ─► RawArtifact
      ─► parse ─► changed races? ─► tier B: snapshot from the aggregate
                                 └► tier A: queue /race/{id} (1 request/s) ─► snapshot with counties
      ─► ResultSnapshot + CandidateVote + ContestMetric ─► publishSnapshot() (same transaction)
      ─► DataSource health ─► /api/v1 read model (10 s cache) ─► monitor (polls every 30 s)
```

### 1. Catalog (`src/scripts/civicapi-catalog.ts`, `npm run results:civicapi:catalog`)
A one-off script, rerun until Nov 2. It is idempotent, because every write is an upsert on an existing unique key.
- **Source and event:** upsert the `civicapi` `DataSource`.
  - Fields: `type OTHER`, `homepageUrl https://civicapi.org`, `expectedCadenceSeconds 30`, `isEnabled false`.
  - `attributionText`: "Results: civicAPI (civicapi.org), aggregated from state and county election offices. Unofficial until certified."
  - Also upsert one `ElectionEvent` (2026-11-03, `GENERAL`, cycle 2026, no state).
- **Contests:** one per region in each aggregate, with `office` `US_SENATE` or `US_HOUSE`. Names are written like "Pennsylvania 7th District" or "Pennsylvania U.S. Senate", with "(Special)" when the region name says special (Ohio and Florida).
  - Set `legacyElectionId` when exactly one 2026 general `Election` row matches the state, office, and district.
- **Candidacies:** upsert a `Person`, `Party`, and `Candidacy` for each candidate. Set `isIncumbent` from `incumbent`.
- **FEC link:** match each candidacy to the race's FEC `Candidate` rows by normalized last name, then party. Set `fecCandidateId` and `legacyCandidateId` only on a single unambiguous match. Unmatched candidates are listed in the report, never guessed.
- **Reporting units:**
  - **Contest unit:** one root unit per contest, `race:<id>` (type `STATE` for Senate, `DISTRICT` for House).
  - **County units:** created later by the ingestor when county results first arrive. Each is `race:<id>:county:<fips>`, with `parentId` pointing to that race's root unit. That gives `contestLevelMetric()` exactly one root.
  - **Split counties:** a county split across House districts gets one unit per district, named "Montgomery County (part)". Counties are never duplicated across districts.
- **County geography:** one `GeographyVersion` named `counties-fips` that lists the `counties` table, with one `COUNTY` `GeographyUnit` per FIPS. Its `sourceUrl` is the Census gazetteer behind `npm run seed:counties`, and its `sha256` hashes the sorted FIPS list. County reporting units link to these, so the read model can return `countyFips` and the map can draw them.
- **Tier A list:** with `--write-tiers`, the script writes `civicapi/tier-a.json`. It holds the Senate and House races whose Kalshi leader is under 80% or that have no market, judged from the latest `market_snapshots`, closest first and capped at `CIVICAPI_TIER_A_MAX` (60). This is the same 80% line as news tier A in `docs/plans/news-agents.md`. Safe Senate seats are left out on purpose, because their county detail costs the most database space (see "Database size"). Rerun on Nov 2 and commit the file.
- **Prerequisites after the database move:** run `seed-counties` and the FEC sync (`POST /api/sync/all`, PLAN.md §5.5) first. Without them, the catalog has no county FIPS to link and no FEC candidates to match. The catalog stops with an error if either table is empty.
- **The report fails the run when** a chamber count is wrong (35 and 435), a state's House count disagrees with `/elections/states/counts`, a contest has no candidates, or an aggregate ID's search title no longer matches. It also prints the FEC match rate.

### 2. Fetch (`features/election-results/civicapi/client.ts`)
- **Settings:** the base URL comes from `CIVICAPI_BASE_URL`. Requests send `accept: application/json` and `user-agent: VoteInformed results-ingestor (+<contact email>)`, and time out after `CIVICAPI_TIMEOUT_MS`.
- **Retries:** one retry with jitter on a timeout or 5xx response, never on a 4xx.
- **Rate cap:** a single token bucket allows at most `CIVICAPI_MAX_RPS` requests per second across all requests.
- **Output:** a `RawResultsDocument` with `sha256`, `etag`, and `lastModified`. If civicAPI returns ETags, the next request sends `If-None-Match`, and a 304 counts as a successful check with no changes.

### 3. Parse (`civicapi/parser.ts`, implements `ElectionResultsParser`)
- **Zod schemas that tolerate change:** numbers are coerced, unknown keys pass through, and a missing field becomes a `ResultsParseIssue` instead of a crash. These are pure functions that are easy to unit-test.
- **Output:** one `RaceUpdate` per race: `sourceContestId`, `percentReporting`, `lastUpdated`, and `candidates[]`. Each candidate has `sourceCandidateId`, `name`, `party`, `votes`, `percent`, and `winnerFlag`. Detail documents also carry `counties[]`, each with `fips`, `name`, `percentReporting`, and `candidates`.
- **Rejecting a race** (an `IngestionError` is logged, the race keeps its current snapshot, and other races still publish):
  - negative or fractional votes
  - `percent` or `percent_reporting` outside 0–100
  - a race ID missing from the catalog
  - a county without a 5-digit FIPS. In New England towns may appear in place of counties; skip them in v1 and log them once per race.
- **Warnings only (the race still publishes):**
  - **Total votes went down.** States correct their counts, so we show the drop and log it.
  - **A new candidate appeared.** Write-ins sometimes show up mid-count. Create the `Candidacy` in the same transaction with `ballotStatus UNCONFIRMED`.
  - **`last_updated` is missing.**

### 4. Store and publish (`civicapi/ingest.ts`)
- **Raw artifact:** one per fetched document, deduplicated on `(sourceId, contentSha256)`.
  - The payload goes to a **Railway Volume** mounted on `results-ingestor` at `RESULTS_RAW_ARTIFACT_DIR`, with `storageKey` `volume:sha256/<hash>.json`. Payloads are never stored in Postgres.
  - Move to the Bucket when PLAN.md §5.3 adds it.
- **Snapshots:** for each race, compare the normalized numbers with the contest's current snapshot. If nothing changed, write no new snapshot (the aggregate's `last_updated` may change on every poll). Also skip the race if the contest already has a snapshot with this artifact's hash (`(contestId, sourceId, payloadSha256)` is unique). If anything changed, write:
  - a `ResultSnapshot`:
    - `payloadSha256` is the artifact's hash, as `publishSnapshot()` requires.
    - `reportingStatus` is `NOT_STARTED` while the race has 0 votes and 0% reporting, `PARTIAL` while `percent_reporting` is under 100, and `COMPLETE` at 100.
    - `certification` is always `UNOFFICIAL`.
  - a `CandidateVote` for each candidacy and unit
  - a `ContestMetric` for each unit, with `votesCounted`, `reportingPercentage`, `isComplete`, and null counts
  - then `publishSnapshot()` in the same `Serializable` transaction, as the fixture ingestion does
- **Ordering trap:** `publishSnapshot()` rejects any snapshot older than the current one. The aggregate's `last_updated` covers the whole feed, while a detail document's covers one race. So **each race takes snapshots from only one kind of document** (see the tiers below), never from both.
- **Bookkeeping:**
  - **Runs:** each cycle writes one `IngestionRun`, with counts of what was fetched, accepted, and rejected.
  - **Source health:** set `lastCheckedAt` on every cycle and `lastSuccessfulAt` on every success. `healthStatus` is `CURRENT`, `DEGRADED` when some races were rejected, or `UNAVAILABLE` after 3 failed cycles in a row.

### 5. Tiers and cadence
| Tier | Races | Snapshots come from | Cadence |
|---|---|---|---|
| **A** | Races in `tier-a.json` (at most 60) | `/race/{id}`, with counties | Queued as soon as an aggregate shows a change, at most once every `CIVICAPI_DETAIL_MIN_INTERVAL_SECONDS` (120) per race. Every tier A race is also refreshed every 10 minutes. |
| **B** | Every other Senate and House race (about 410) | The Senate or House aggregate | Every 30 s |

- **The two aggregates are polled every 30 s** (`RESULTS_POLL_INTERVAL_SECONDS`), 2 requests per cycle. For tier A they only detect changes.
- **Detail requests run at `CIVICAPI_DETAIL_RPS` (1 per second).** After a big batch of new results, all of tier A refreshes within about a minute.
- **Tier A totals can trail the aggregate by up to 2 minutes.** That is the cost of consistent county detail. The race card shows each snapshot's own "as of" time.
- **Load is about 0.5 requests per second on average, and at most about 1.1.** That is modest for a free service, and we tell civicAPI our expected volume in advance (see "To confirm").

### Database size
Every snapshot stores every unit's numbers again, and `Third_database` has 5 GB. A `candidate_votes` row takes about 0.6 KB including its three indexes.
- **Tier B** is small: about 410 races × 60 changes on the night × 5 rows ≈ 120,000 rows (under 0.1 GB).
- **Tier A** is the big one. Assume 60 races with about 1,500 county units (15 close Senate states plus 45 House districts) and about 4 rows per unit, so about 6,000 rows per full refresh. At most one refresh every 2 minutes over 6 busy hours gives 180 refreshes ≈ 1.1 million rows (about 0.7 GB).
- **For comparison:** county detail for all 35 Senate races, refreshed every 30 s, would be roughly 4–5 GB. That is why tier A is capped and safe Senate seats are left out.
- **On the night:** check `SELECT pg_size_pretty(pg_database_size(current_database()))` at 9 PM and 11 PM ET. Past 3.5 GB, set `CIVICAPI_DETAIL_MIN_INTERVAL_SECONDS=600`. Past 4.5 GB, set `CIVICAPI_TIER_A_ENABLED=false`.
- **Cut line:** if time runs out, ship with `CIVICAPI_TIER_A_ENABLED=false`. Every race then takes contest-level totals from the aggregates, and county detail shows "Not available yet".

### 6. Worker (`src/workers/results-ingestor.ts`)
- **Service:** a Railway service named `results-ingestor` (PLAN.md §5.2) runs `node dist/workers/results-ingestor.js` with **exactly 1 replica** and the Volume attached.
- **Lease:** each cycle takes the `results-civicapi` `SyncLease` for 3 times the poll interval and releases it when done. A second replica started by mistake just skips its cycles. Leases are per cycle, so no renewal is needed.
- **Settings:** the loop runs only when `RESULTS_INGESTOR_ENABLED=true`, and stops cleanly on SIGTERM.
- **Testing environment:** until the service exists, `RESULTS_INGESTOR_IN_PROCESS=true` runs the same loop inside `api`, as the news plan does. Use it only while `api` has one replica.

### 7. Contract and read model (contract `1.1.0`, additive)
- **Estimated progress:** add `ReportingProgress.estimatedPercentage: number | null`. The read model fills it from `ContestMetric.reportingPercentage` when precinct counts are null. `precincts` stays all-null, so no counts are invented.
- **FEC link:** add an optional `fecCandidateId` to `CandidateSchema`, filled from `Candidacy.fecCandidateId`.
- **Smaller bootstrap:** `GET /api/v1/bootstrap?units=none` leaves out `reportingUnitResults`, so the bootstrap stays small across about 470 contests. Counties come from `/contests/:id/results/current` for the selected race only.
- **Caching:** a 10-second in-process cache on `/bootstrap` and `/contests/:id/results/current`, keyed by URL and manifest version, on top of the ETags. Public reads stay cheap as `api` scales.
- **Version:** bump `RESULT_CONTRACT_VERSION` to `1.1.0` and update the fixtures and contract tests. The frontend accepts any `1.x`.

### 8. Frontend (`VITE_RESULTS_LIVE_ENABLED`, on `web`)
- **Loader:** a new `election-monitor/liveResults.ts` with `useLiveResultsFeed()`. It calls `GET /api/v1/bootstrap?units=none` with `refetchInterval: 30_000` and indexes results by race key (state, office, district).
  - A **404** means "No live results provider connected".
  - A **503 with `"No results source is available"`** is what the kill switch produces. It **clears** the results, so a source switched off stops showing numbers in open tabs too.
  - **Any other 503 or a network error** means "Results temporarily unavailable". The last good data stays on screen with its "as of" time.
- **Monitor:** `ElectionMonitor` uses the mock feed for the fictional `EX` state and the live feed otherwise. A second query loads the selected race's counties.
- **Types:** `MonitorResults.candidates` gains `name`, `party`, and `fecId`, plus a `progressLabel` that is either precinct-based or "civicAPI estimate".
- **Race card:**
  - FEC candidates are matched by `fecId`. Any civicAPI candidate without a match is listed by its civicAPI name, below the matched ones.
  - The top candidate is labelled "Leading", never "Won".
  - The progress line reads "About 64% of expected vote counted (civicAPI estimate)".
- **Stale or unavailable data:** when `meta.freshness` is `STALE` or the source is `UNAVAILABLE`, a banner shows "Results last updated 9:42 PM ET. The results source is delayed." It links to the state's official results page from a new hand-checked `CODE/public/data/state-results-links.json` (50 states and DC). This fallback is the one PLAN.md §3 already plans. The War Room plan's `stateResultsLinks.ts` lives on `Frontend_testing`, which never merges here, so this JSON file is the one hand-checked list, and that file should be generated from it.
- **Source line:** the footer and the race card show the `attributionText`, which meets civicAPI's attribution requirement.
- **Status labels:** the stat strip's "Live results" and "Results" entries say "civicAPI" instead of "No provider connected".
- **Later (phase 3, optional):** a "Results" map mode colouring each race by its current leader, with the odds map's rules for never showing 50/50 and for flips. Not needed for Nov 3.

## Testing
- **Recorded fixtures:** save real payloads today in `features/election-results/civicapi/fixtures/`. They are public data, credited to civicAPI.
  - Both aggregates (all zeros before Nov 3).
  - Three detail races: an at-large seat, a split-county district, and `TX-SEN` for county volume (254 counties).
  - One finished past race found through `/race/search` (for example a Nov 2025 statewide race), for non-zero votes and counties.
- **Unit tests:**
  - parsing keys (`-al`, Senate state keys) and mapping parties
  - missing and malformed fields
  - change detection
  - tier selection
- **DB tests:**
  - ingesting the same payload twice writes one snapshot
  - a newer snapshot replaces the current one, and an older one is rejected
  - an unknown candidate creates a candidacy and a warning
  - one bad race is rejected while the others publish
  - county units link to FIPS geography
- **Route tests:** bootstrap with the `civicapi` source enabled validates against contract `1.1.0`, `units=none` drops counties, and the cache serves repeat requests.
- **Running them:** add every new test file to the `test:results` script in `backend/package.json`.
- **Rehearsal (Nov 1):** `results-ingestor --replay <dir>` feeds a series of edited fixtures through the real pipeline every 30 s into the Testing database, and we watch the monitor.
  - Then point `CIVICAPI_BASE_URL` at a dead host. The source must turn `STALE` within 5 minutes, and the official-results links must appear.
- **Load test:** `/api/v1/bootstrap?units=none` at the expected election-night traffic, with the cache on (PLAN.md §3).

## Settings
| Variable | Service | Default | Purpose |
|---|---|---|---|
| `FEATURE_ELECTION_DASHBOARD` | `api` | `false` | Existing. Must be `true` for `/api/v1` to answer |
| `RESULTS_PROVIDER_ENABLED_IDS` | `api` | empty | Existing. Set to `civicapi` |
| `RESULTS_POLL_INTERVAL_SECONDS` | ingestor | `30` | Existing. Aggregate cadence |
| `RESULTS_STALE_AFTER_SECONDS` | `api` | `300` | Existing. Consider `120` on election night |
| `RESULTS_PARSER_VERSION` | ingestor | `unconfigured` | Existing. Set to `civicapi/1.0.0` |
| `RESULTS_INGESTOR_ENABLED` | ingestor | `false` | Starts the polling loop |
| `RESULTS_INGESTOR_IN_PROCESS` | `api` | `false` | Testing only: runs the loop inside `api` |
| `RESULTS_RAW_ARTIFACT_DIR` | ingestor | `.local/raw-artifacts` | The Volume mount path in Railway |
| `CIVICAPI_BASE_URL` | ingestor | `https://civicapi.org/api/v2` | Base URL |
| `CIVICAPI_SENATE_AGGREGATE_ID` / `CIVICAPI_HOUSE_AGGREGATE_ID` | ingestor | `87528` / `87524` | Aggregate race IDs (checked by the catalog) |
| `CIVICAPI_TIER_A_ENABLED` | ingestor | `true` | `false` takes everything from the aggregates (the cut line, and the database-size brake) |
| `CIVICAPI_TIER_A_MAX` | catalog | `60` | Cap on the races in `tier-a.json` |
| `CIVICAPI_DETAIL_MIN_INTERVAL_SECONDS` | ingestor | `120` | Shortest gap between county snapshots for one race |
| `CIVICAPI_DETAIL_RPS` / `CIVICAPI_MAX_RPS` | ingestor | `1` / `2` | Request pacing |
| `CIVICAPI_TIMEOUT_MS` | ingestor | `15000` | Per-request timeout |
| `CIVICAPI_ACCEPT_TEST_DATA` | ingestor and `api` | `false` | Testing rehearsals only: store and serve civicAPI test data, labelled TEST DATA |
| `CIVICAPI_TIER_A_RACES` | ingestor | empty | Comma-separated races (`PA-07,GA-SEN`) to use instead of the Kalshi-based tier A |
| `CIVICAPI_TIER_A_AS_OF` | ingestor | `2026-11-02T12:00:00Z` | Tier A uses the latest Kalshi hour at or before this time (the latest stored when there is none), so restarts agree. Empty uses the latest hour |
| `CIVICAPI_DETAIL_REFRESH_SECONDS` | ingestor | `600` | Every tier A race is refreshed at least this often |
| `CIVICAPI_CONTACT` | ingestor | empty | Contact added to the User-Agent |
| `LIVE_STREAMS_ENABLED` | `api` | `true` | `GET /api/live-streams` |
| `VITE_RESULTS_LIVE_ENABLED` | `web` | `true` | Live results in the War Room (needs a rebuild; set `false` to hide) |
| `VITE_FEATURE_LIVE_STREAMS` | `web` | `true` | The War Room's Live coverage panel |

## Election-night runbook
- **Nov 1 (rehearsal on Testing):** `CIVICAPI_ACCEPT_TEST_DATA=true` on `api` and the ingestor, `RESULTS_INGESTOR_ENABLED=true`, `FEATURE_ELECTION_DASHBOARD=true`, `RESULTS_PROVIDER_ENABLED_IDS=civicapi`, `data_sources.is_enabled = true`. The War Room Night screen fills with civicAPI's test numbers, labelled TEST DATA. Then point `CIVICAPI_BASE_URL` at a dead host: within 5 minutes the source turns stale and the official links appear. Set `CIVICAPI_ACCEPT_TEST_DATA=false` afterwards.
- **Nov 2:**
  - Run the ballot sync (`npm run sync:ballot -- --apply`) so every race and candidate is in the catalog; the ingestor uses it. Optionally pin tier A with `CIVICAPI_TIER_A_RACES`.
  - Deploy `results-ingestor` (or `RESULTS_INGESTOR_IN_PROCESS=true` on a single-replica `api`) with `RESULTS_INGESTOR_ENABLED=false`, and a Volume at `RESULTS_RAW_ARTIFACT_DIR`.
  - Build `web` with `VITE_FEATURE_WAR_ROOM=true` (live results and live coverage are on by default). The War Room says "Results · not connected" until the source is enabled.
  - Admin dashboard > Live coverage: paste each network's election-night YouTube link once it is announced.
  - Run `npm run check:results-links` in `CODE/` and open each official link by hand.
- **Nov 3, 4:00 PM ET:**
  - Set `data_sources.is_enabled = true` for `civicapi`, `RESULTS_PROVIDER_ENABLED_IDS=civicapi` and `FEATURE_ELECTION_DASHBOARD=true` on `api`, and `RESULTS_INGESTOR_ENABLED=true` on the ingestor. Check `CIVICAPI_ACCEPT_TEST_DATA` is `false` everywhere.
  - If civicAPI still reports `test_data: true` after polls start closing, nothing publishes and the War Room says so; contact civicAPI, and use the official links meanwhile.
  - `BALLOT_SYNC_ENABLED=false` for the night, so the ballot sync does not rewrite candidacies while counts arrive.
  - Watch `/api/v1/sources/status` and the `ingestion_runs` and `ingestion_errors` tables. The first polls close at 6:00 PM ET in parts of Indiana and Kentucky.
  - Check the database size at 9 PM and 11 PM ET (see "Database size").
- **Kill switch:** set `data_sources.is_enabled = false` for `civicapi`.
  - The read model stops serving it on the next request (after the 10-second cache), with no deploy. `/api/v1/bootstrap` returns 503 "No results source is available". Open War Rooms clear their results within 30 seconds and show "Results · switched off" and the official-results links.
  - Removing `civicapi` from `RESULTS_PROVIDER_ENABLED_IDS` does the same, but restarts `api`.
- **After Nov 6:** lower the cadence to 10 minutes and keep polling through certification. Some states, such as California, keep counting for weeks.

## Commits (each passes `npm run typecheck && npm run build && npm run test:results` in `backend/`, and lint, typecheck, and build in `CODE/` where touched)

### 0. `docs(plans): live results from civicAPI`
- This file, plus the PLAN.md updates (§2, §5.2, §5.4, §6).

### 1. `feat(results): civicAPI client, parser, and recorded fixtures`
- `civicapi/client.ts` and `parser.ts`, plus the fixtures. Unit tests only, with no live calls in CI.

### 2. `feat(results): civicAPI catalog script`
- `scripts/civicapi-catalog.ts`, the `counties-fips` geography, FEC matching, and `--write-tiers`.
- Tests: key parsing, idempotent upserts, and FEC match rules (unique, ambiguous, none).

### 3. `feat(results): civicAPI ingestion and results-ingestor worker`
- `civicapi/ingest.ts`, `workers/results-ingestor.ts`, the lease, tiers, source health, Volume storage, and `--replay`.
- DB tests from the Testing section.
- **This is shippable on its own:** totals for every race reach `/api/v1`.

### 4. `feat(results): contract 1.1.0 with estimated progress and FEC IDs`
- The contract, read model, route cache, and `units=none` changes, plus the fixture and test updates.

### 5. `feat(monitor): live civicAPI results on race cards`
- `liveResults.ts`, `RaceCard` and `UnitsCard` changes, the stale banner, `state-results-links.json`, and the `VITE_RESULTS_LIVE_ENABLED` flag.

## Schedule
| When | Work |
|---|---|
| Oct 29 | Allow civicapi.org in the Claude session's network settings. Record fixtures. Check the aggregate IDs. Commits 0–1. Email civicAPI (see below). |
| Oct 30 | Commits 2–3. In Testing, run `seed-counties` and the FEC sync (PLAN.md §5.5), then the catalog and the ingestor (`RESULTS_INGESTOR_IN_PROCESS=true` on `Backend`). **Code freeze, with this exception.** |
| Oct 31 | Commits 4–5. Create the `results-ingestor` Railway service and its Volume. |
| Nov 1 | Replay rehearsal, outage drill, and load test. Hand-check `state-results-links.json`. |
| Nov 2 | Production catalog and tiers. Flags set as in the runbook. Final freeze. |
| Nov 3 | Turn on at 4:00 PM ET. Check health at 6, 7, 8, 9, and 11 PM ET and 1 AM ET. |

## Risks
- **civicAPI goes down or slows on election night.**
  - It has no SLA, and it is a small free service under peak load.
  - **Mitigation:**
    - The last good numbers stay on screen, labelled with their time.
    - The source turns `STALE`, and each race links to its state's official results.
    - The ingestor keeps retrying on its normal cadence, without bursts.
- **Fields or IDs change.** The parser tolerates change, the IDs are in settings, the catalog checks the aggregates, and a parse issue rejects one race, not the run.
- **Aggregation errors,** such as a county assigned to the wrong race or a stale state.
  - Per-race checks reject impossible numbers. A plausible but wrong number can still get through.
  - The kill switch works per source only. Hiding a single race is out of scope for v1.
- **Attribution.** civicAPI's terms require credit. The source line has to stay visible wherever its numbers appear.

## To confirm before building
- **The freeze exception,** and the change to PLAN.md §6: civicAPI's published terms instead of a signed contract. This also overrides the "link out only" guidance in the polling and War Room plans.
- **The response shape.** Check every field name above and both aggregate IDs against a live response. civicapi.org has to be added to Allowed domains in this Claude session's network settings. Railway's outbound network is open.
- **County results for House races.** Does civicAPI return them, and does it report only the part of a county inside the district? How are New England towns keyed?
- **The `winner` flag.** Does it mean a projection, a source's call, or certification? That decides whether a later version shows it.
- **Email civicAPI** (contact through civicapi.org). Give our expected volume of about 1 request per second at peak, and ask whether they have a status page or a preferred polling rate.
