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

**A5. County shifts, 2024 to 2026 (every state with a statewide race)**

Which counties moved most between the 2024 presidential vote and the 2026 midterm? And did the counties that moved most from 2020 to 2024 (South Texas among them) keep moving, hold, or move back?

- **The 2026 side:** each state's statewide race, by county. That's the U.S. Senate race where there is one (35 races; their civicAPI ids are in the Senate aggregate's `region_results.<state>.election_id`), and governor otherwise (find the ids with civicAPI's race search in the morning). Texas has both, so it shows both. civicAPI's race document lists every county by 5-digit FIPS with its own `percent_reporting` (see `backend/src/features/election-results/civicapi/parser.ts`).
- **The baselines:** `CODE/public/data/past-results/president-2024.json` and `president-2020.json`. Each holds `[D, R, other]` votes for each of 3,112 county FIPS codes, including all 254 Texas counties.
- **Measures:**
  - Margin: D share minus R share of all votes, as everywhere else.
  - Shift: the 2026 statewide margin minus the 2024 presidential margin.
  - Prior shift: 2020 to 2024.
  - Turnout ratio: 2026 total votes ÷ 2024 presidential total votes.
- **Outputs:**
  1. **Largest shifts nationally:** the 25 counties that moved most toward each party, among counties with at least 5,000 votes in 2026 so tiny counties don't crowd the list. Every county is in the CSV.
  2. **Did the 2024 movers hold?** A scatter of the 2020 to 2024 shift (x) against the 2024 to 2026 shift (y), one dot per county sized by votes. In words: of the 100 counties that moved most toward Republicans from 2020 to 2024, how many moved back toward Democrats in 2026, and by how much (median). The same for the 100 that moved most toward Democrats.
  3. **Texas spotlight:** all 254 counties, with Senate and governor side by side and a shift map. For the 20 Texas counties with the largest 2020 to 2024 shift, a three-point line: 2020, 2024, 2026. For example, Starr County went from D+5.0 in 2020 to R+16.0 in 2024 in the MIT data; the line shows where 2026 put it.
  4. **By state:** the vote-weighted and the median county shift.
  5. **A county shift map:** a diverging scale with the same bins in both directions, county shapes from `us-atlas`.
- **Rules:**
  - Only counties at 95% reporting or more (civicAPI's per-county figure) are compared; the rest are counted and listed.
  - The label always names both contests, for example "2026 Senate vs. 2024 President". A different race measures candidates as well as places. Where the Senate and governor results disagree in a county, show both.
  - Midterm turnout is lower, so the turnout ratio sits next to every shift. A shift can come from who turned out as well as from people changing their vote, and the page never claims which.
  - Counties are places, not groups of voters. No sentences like "Hispanic voters swung back". If our API is reachable, ACS figures can be shown as facts about a county.
  - Races without both a Democrat and a Republican are left out. Maine and Alaska are first-round votes. A Georgia runoff, if any, uses the Nov 3 round.
- **Not comparable, shown in grey:**
  - Alaska (no county results in either file).
  - Connecticut (the 2024 file uses its old counties).
  - New England states where civicAPI reports towns rather than counties (the parser drops towns; adding towns up into counties can come later).
  - The states with no Senate or governor race this year. By our count those are IN, MO, ND, UT and WA; check against civicAPI.
- **Fallback:** if civicAPI has no governor races, states with only a governor race (AZ, CA, CT, HI, MD, NV, NY, PA, VT, WI) can use the sum of every House candidate's county votes, labelled "2026 House vote, all districts". Counties in uncontested districts are left out.
- **Load:** about 60 to 70 race documents from civicAPI at 1 per second, roughly 10 minutes at election-week response times. Fetch them once, at the freeze.
- **Afterwards:** this becomes a 2024 to 2026 "Shift" view in the map's Past results mode (product idea 3).

### Tier 2: if the data and time allow

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
| 7:30 | Freeze: pull every source once and stamp one "as of" time for the whole report. Start the county documents for A5 first, since they take about 10 minutes |
| 7:45 | Tier 1: A1, A5 (county shifts), A2, A4, then A3 if the API is reachable |
| 9:30 | Tier 2, as data allows |
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
