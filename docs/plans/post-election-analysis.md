# Post-election analysis: the Nov 4 morning report

Written Nov 3, 8 PM ET. Goal: a sourced analysis of the 2026 results **as counted by 11:00 AM ET on Nov 4**, built from the data VoteInformed already stores plus public sources. This file is the plan only. Nothing here has been run yet.

The site's principles (PLAN.md §1) apply to the report: nonpartisan and symmetric wording, numbers from code, market prices labelled as market prices, missing is not zero, and every number carries its source and "as of" time.

## Output

- **One report page** (a private claude.ai Artifact the team can share), with an "Count still in progress" banner, a freeze time on every number, and a Methods section.
- **The tables behind it** as CSV in `analysis/2026-11-04/` on the working branch, so every number can be checked and the page can be rebuilt.
- Scripts that rebuild the page from the CSVs, so a later run (Nov 6, after certification) is a rerun, not a rewrite.

## Data sources and whether this session can reach them

Checked Nov 3, 8 PM ET from the cloud session.

| Source | What it gives | Reachable |
|---|---|---|
| civicAPI `/api/v2/race/{id}` | Results, estimated progress, race calls, county detail | Yes (slow, about 10 s a document; one 502 at 8 PM) |
| VoteHub | National and race polls | Yes |
| Repo static data | MIT Election Lab House and Senate 1976–2024, president by state and county 2000–2024 (`CODE/public/data/past-results/`), seat holders (`seat-holders-2026.json`), redistricted states (`CODE/src/features/election-monitor/map/redistricting-2026.json`), poll closing times (`CODE/src/features/war-room/night/pollClosings.ts`) | Yes |
| congress-legislators (GitHub raw) | Incumbents, party switches | Yes |
| **Our Testing API** (`chic-essence-testing.up.railway.app`) | Stored hourly Kalshi prices, FEC money, outside spending, ACS demographics, poll averages, early vote, cost of living | **No: blocked by the session's network policy** |
| Kalshi, FEC, Census APIs | Same data at the source | No: blocked |
| Testing database | Snapshot history, race calls, Kalshi history | No: SQL has to be run by a person (queries below) |

**Single biggest unlock:** add `chic-essence-testing.up.railway.app` to the environment's Allowed domains. That alone opens analyses A3, A7, A8 and A9.

## Analyses, in priority order

Every analysis states how many races it left out and why.

### Tier 1: the core report (do first)

**A1. Scoreboard, flips and incumbents**
- Seats called and leading per chamber, net change against the members holding the seats today (`seat-holders-2026.json`; a vacant seat is compared with its last holder, an independent counts as neither party, as on the odds map).
- The list of seats that changed party, and incumbents who lost.
- Data: civicAPI aggregates (Senate `87528`, House `87524`) or our `/api/v1/bootstrap?units=none`.

**A2. Swing from 2024 and from the last midterm**
- Margin is Democratic share minus Republican share of all votes cast for the office (the Past results definition). Swing is the 2026 margin minus the earlier margin, in points, described as "moved X points toward Democrats" or "toward Republicans".
- **House:** each district against its 2024 House result and its 2022 result. Districts in the 10 redistricted states are left out (their 2026 lines differ from the 2024 shapes), as are races unopposed in either year and races under 95% of expected vote (civicAPI estimate).
- **Senate:** each state against its 2024 presidential margin and against the 2020 race for the same seat (this year's regular seats were last up in 2020). Specials are compared with 2024 president only.
- **National House vote** counted so far against the 2024 House vote, with the warning that West Coast mail ballots and unopposed seats move this number for days.
- Output: a distribution of district swings, the median swing, and the largest movers in each direction.

**A3. How the market prices compared with the results** *(needs our API or the SQL below)*
- For each race: the Kalshi price of each outcome in the last stored hour before the first polls closed (6 PM ET), against the called winner. Races not called by the freeze are left out and counted.
- Calibration: races grouped by the leader's price (50–60, 60–70, 70–80, 80–90, 90–100¢), with the share the leader actually won. Plus a Brier score, and a list of called winners priced under 40¢.
- Chamber-control markets against the outcome.
- Framed as a check of Kalshi's prices, never as our forecast. Matching Kalshi outcomes to candidates reuses `backend/src/services/kalshi/race-candidates.ts`.

**A4. How the polls compared with the results**
- The generic ballot average (`polls-avg-v1`, VoteHub, party-sponsored polls left out) against the national House margin counted so far.
- Senate races with at least 2 nonpartisan polls in the last 30 days: poll average margin against the result. Signed error and absolute error per race, plus the average of each, worded the same way in either direction.
- Races with no public polling are listed as such, not given a zero.

### Tier 2: if the data and time allow

**A5. County shifts in the close Senate races**
- For the races with county detail: the 2026 Senate margin in each county against its 2024 presidential margin, and 2026 total votes as a share of 2024's.
- Output: the counties that moved most in each direction per state, and a scatter of shift against the 2024 margin.
- Data: civicAPI `/race/{id}` or our `/api/v1/contests/:id/results/current`, plus `president-2024.json` (3,112 counties).

**A6. How the count unfolded** *(needs the SQL below)*
- Hours from each state's poll closing to each call.
- Races where the leader at 25% of expected vote was not the leader at the freeze, worded neutrally ("the early leader changed"), never "red mirage" or "blue shift".

**A7. Early vote against the count** *(needs the early-vote data saved tonight)*
- Early and mail ballots as a share of all votes counted, by state (a ceiling while counting continues).
- The party registration of early ballots next to the result, labelled "registration, not vote choice".

**A8. Money against results** *(needs our API)*
- Receipts and spending of winners against losers, outside spending for and against each, and how often the better-funded candidate won.
- Labelled as an association, never as money deciding a race (idea P04's rule). FEC post-general reports, due Dec 3, will fill in final spending for the next run.

**A9. Signals retrospective** *(needs A3, A4 and A8)*
- Races where markets, polls and money pointed different ways before the election (differentiator 3), and which signal matched the result.

**A10. Context (last, optional)**
- State swing alongside the tariff-exposure score, the 1-year gas price change and the unemployment change. District swing alongside ACS education, income and age.
- Descriptive only: these describe areas, not voters, and with about 50 states the pattern is illustrative. No claims about how any group voted.

## Caveats that go on the page

- The count is not finished at 11 AM. California, Washington, Oregon, Nevada, Arizona and others count mail ballots for days, and early-counted and late-counted ballots differ, so swing and the national vote will move.
- Progress is civicAPI's own estimate of expected vote, not precincts reporting.
- Calls are civicAPI's decision desk. They are media projections, not certification.
- Maine and Alaska use ranked choice; their figures are first-round votes.
- District comparisons use 2024 lines, so redistricted states are left out of district swing.

## Morning run (about 3 hours)

| ET | Step |
|---|---|
| 7:30 | Freeze: pull every source once and stamp one "as of" time for the whole report |
| 7:45 | Tier 1: A1, A2, A4, then A3 if the API is reachable |
| 9:15 | Tier 2, as data allows |
| 10:15 | Write the page; check every number against its CSV and every sentence for symmetric wording |
| 10:45 | Publish; 11:00 done |

## Before then (a person has to do these)

1. **Allow the API host** (`chic-essence-testing.up.railway.app`) in the cloud environment's Allowed domains (optional: `api.elections.kalshi.com`, `api.open.fec.gov`, `api.census.gov`).
2. **Save the early vote data tonight.** `/api/early-vote` is held only in memory, so a restart loses it:

   ```bash
   curl -s https://chic-essence-testing.up.railway.app/api/early-vote -o early-vote-2026-11-03.json
   ```

3. **In the morning, export these three queries** from the Testing database (Railway, `Testing_database`, Data tab) as CSV, for A3 and A6.

Final pre-election Kalshi prices (last stored hour before 23:00 UTC, when the first polls closed):

```sql
WITH last_hour AS (
  SELECT source_market_id, max(captured_hour) AS h
  FROM market_snapshots
  WHERE provider = 'KALSHI' AND captured_hour < '2026-11-03 23:00:00'
  GROUP BY source_market_id
)
SELECT m.scope, m.state_code, m.district_code, m.source_event_id, m.source_market_id, m.outcome,
       m.price, m.price_type, m.yes_bid, m.yes_ask, m.volume, m.captured_hour
FROM market_snapshots m
JOIN last_hour l ON l.source_market_id = m.source_market_id AND l.h = m.captured_hour
WHERE m.provider = 'KALSHI'
ORDER BY m.scope, m.state_code, m.district_code, m.price DESC;
```

Race calls:

```sql
SELECT c.office, c.state_code, c.district_code, p.display_name, pa.abbreviation AS party,
       rc.kind, rc.called_at, rc.called_at_source, rc.first_seen_at, rc.retracted_at
FROM race_calls rc
JOIN contests c ON c.id = rc.contest_id
JOIN candidacies cd ON cd.id = rc.candidacy_id
JOIN people p ON p.id = cd.person_id
LEFT JOIN parties pa ON pa.id = cd.party_id
WHERE rc.is_test_data = false
ORDER BY rc.called_at;
```

Count timeline (race-level totals in every published snapshot):

```sql
SELECT c.office, c.state_code, c.district_code, s.source_updated_at, s.received_at,
       p.display_name, pa.abbreviation AS party, v.votes, cm.reporting_percentage
FROM result_snapshots s
JOIN contests c ON c.id = s.contest_id
JOIN candidate_votes v ON v.snapshot_id = s.id AND v.vote_type = 'TOTAL'
JOIN reporting_units ru ON ru.id = v.reporting_unit_id AND ru.parent_id IS NULL
JOIN candidacies cd ON cd.id = v.candidacy_id
JOIN people p ON p.id = cd.person_id
LEFT JOIN parties pa ON pa.id = cd.party_id
LEFT JOIN contest_metrics cm ON cm.snapshot_id = s.id AND cm.reporting_unit_id = ru.id
WHERE s.is_test_data = false AND s.publication_status IN ('PUBLISHED', 'SUPERSEDED')
ORDER BY c.state_code, c.district_code, s.source_updated_at, v.votes DESC;
```

Without the queries, A3 falls back to our API (if allowed) and A6 is dropped.
