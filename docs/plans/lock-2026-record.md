# Lock the 2026 record (#136)

Planned and built Nov 12. Certification keeps being entered as states certify, after the Nov 25 launch (#153).

## Goal

Every 2026 federal race (35 Senate, 435 House) has its final count stored at county level, labelled honestly
(still counting, unchanged since a date, or certified, with the state's source), and every 2026 Kalshi race
market has its settlement stored. Replay (#139), swing (#140) and the scorecard (#141) read these numbers.

## What we found (Nov 12, from civicAPI directly)

- **County detail exists for every race, not only the ~60 close ones.** All 8 races sampled (safe and close,
  1 to 159 counties: WV-01, AL-01, TX-02, CA-26, NY-15, and the WV, KY and GA Senate races) have
  `region_results` by county, and county votes add up exactly to the race total. This retires the issue's
  main risk. A full pass is 470 detail documents plus the 2 aggregates.
- **`percent_reporting` cannot tell us a race is final.** It is civicAPI's estimate against its own expected
  turnout. Nine days after the election it reads 75% for West Virginia's Senate race and 86% for
  Kentucky's, though both states finished counting long ago; 13 of 35 Senate races are under 90%. We
  must not show it as "share counted" after election night, and must not use it to decide "complete".
- **`last_updated` changes on every request**, even when no number moves, so only a change in the vote
  numbers shows that counting moved. The ingestor already deduplicates on the payload's content, and
  `result_snapshots.published_at` is set only when the numbers change. "Unchanged since" can be read from
  the current snapshot without any schema change.
- **Races that need their own label** (civicAPI aggregates, Nov 12):
  - *Unopposed:* FL-10, MA-02, MA-05, MA-07, WI-02. Florida prints no votes for an unopposed candidate,
    so FL-10 reads 0 votes and 0%. It must read "Unopposed", never 0.
  - *Runoff:* LA-05 and LA-06 (`advanced` on two candidates each). The runoff is a separate contest.
  - *Ranked choice:* AK-AL and the Alaska Senate race show first-choice votes only and have no winner yet.
    Maine also uses ranked choice for federal races.
  - *Too close, no call:* MN-01 (322 votes), NC-05, NC-07, NC-10, TN-04, and CA-04 (two Democrats,
    top-two). These are recount candidates.
- **Kalshi settlement is not stored.** `kalshi/shared.ts` treats a price of 0 or 1 as "no quote", so
  settled markets drop out of `market_snapshots` silently.
- **Raw civicAPI payloads are not kept.** They are written to `RESULTS_RAW_ARTIFACT_DIR` on `Backend`'s
  container disk, which has no volume, so they are lost on every redeploy. The 34,814 `raw_artifacts`
  rows point at files that no longer exist. The parsed numbers are in the database and in the nightly
  backups (#190); the source documents are not.
- **Nothing writes certification.** `certification_events` is empty, every snapshot is `UNOFFICIAL`, and
  the results contract knows only `UNOFFICIAL` and `CERTIFIED`.

## Plan

### 1. Finals mode for the ingestor (backend, M)

The election-night loop (aggregates every 30 s, county detail for tier A) still runs in `Backend` on
Testing. Replace it with a finals pass:

- Every 6 hours (`CIVICAPI_FINALS_INTERVAL_MINUTES=360`), read both aggregates for the race list, then the
  detail document of **every** race, county by county, at most 1 request a second (about 8 minutes a
  pass). Behind `CIVICAPI_FINALS_MODE=true`; the night loop stays in the code for 2028.
- Detail documents only, so a race never switches document kinds (`tiers.ts`). **Test first** that a detail
  snapshot publishes after an aggregate snapshot stamped with the later cycle time (#132). If publishing
  rejects it as older, finals mode must stamp detail snapshots the same way.
- Unchanged documents publish nothing (content dedupe). Each pass logs races changed, races unchanged and
  races failed, and a failed race keeps its last snapshot.
- Stop when every state has certified, or by `CIVICAPI_FINALS_UNTIL` (default Jan 6, 2027, the joint
  session).

### 2. Keep the source documents (backend, S)

Write each finals-pass document that changed (gzip, keyed by content hash) to the `db-backups` bucket
under `raw/civicapi/`, instead of the container disk. Railway's bucket variables are the same ones
`db-backup` uses. This is the 5.3 item "point `RawArtifact` storage at a bucket", done for results only.
The night's lost files cannot be recovered; say so on /data (#144).

### 3. Race status labels (backend read model and contract 1.2.0, S to M)

Derived in the read model, never stored as numbers:

| Status | When | Shown as |
|---|---|---|
| `COUNTING` | The current snapshot changed within the last 72 hours | "Unofficial · still counting · updated Nov 12" |
| `STABLE` | No change for 72 hours or more | "Unofficial · no change since Nov 9" |
| `RECOUNT` | A recount event is recorded for the race | "Recount · <source>" |
| `CERTIFIED` | The state's certification is recorded | "Certified Dec 4 · <state source>" |
| `UNOPPOSED` | One candidate on the ballot | "Unopposed" (no votes, no share) |
| `RUNOFF` | A candidate has `advanced` | "Runoff · <date>" |
| `RANKED_CHOICE` | AK or ME, no winner from first choices | "First-choice votes · ranked-choice count by the state" |

- Contract 1.2.0 (additive): `finalStatus`, `lastChangedAt`, `certifiedAt`, `certificationSourceUrl`,
  `certificationDeadline`, and `RECOUNT` and `CONTESTED` in `certificationState`.
- After election night, `percent_reporting` is shown nowhere as "share counted".

### 4. Certification, by state (backend, admin and data, S to M)

No API reports certification, so it is entered by hand with a source, the way stream links are:

- `backend/data/certification-deadlines-2026.json`: each state's legal deadline for federal results, with the
  source of each date (NCSL's certification deadline table, checked against each state's law).
- Admin dashboard: "Record certification" for a state (date, link to the state's certified results, notes),
  plus "Record recount" for a race. Writes one `certification_events` row per federal contest in that
  state. No migration needed; the table and enums exist.
- When a state certifies, run a finals pass for that state at once and compare its totals with the state's
  certified totals for each race. If a race differs, the admin sees the difference and can record a
  `CORRECTED` event with the state's numbers in the notes. civicAPI's numbers are never overwritten in
  place, because results are append-only.
- Alaska ranked choice: the state's final round is entered with the certification (winner and final-round
  totals, with the source link), shown beside the first-choice counts.

### 5. Kalshi settlements (backend, migration, S to M)

- New table `market_settlements` (additive): provider, `source_market_id` (unique), event ticker,
  `contest_id`, outcome, result (`YES`, `NO` or `VOID`), settlement value, settled time, fetched time.
- A daily job reads each 2026 race market in the Kalshi catalog and stores it once settled. Confirm the
  field names (`status`, `result`, `settlement_value`) against Kalshi's API docs first; Kalshi is not
  reachable from the development sandbox.
- Cross-check: a settled market whose winning outcome disagrees with the race's call or certified winner
  is listed in the admin dashboard. The scorecard (#141) scores prices against settlement and results, so
  this table is its input.
- `market_snapshots` stays prices only; a settlement is not a price.

### 6. Check and record (S)

- `npm run check:finals -- --state WV` prints our race and county totals for a state, to compare against
  the official results pages in `CODE/public/data/state-results-links.json`.
- Spot-check five states, chosen to cover the cases: one big county state (GA), one slow counter (CA), one
  with recount candidates (NC), one with ranked choice (AK) and one small state (WV). Record each result
  in this file, with the date and the state's link.

## Order and dates

| Day | Work |
|---|---|
| Nov 12 | Steps 1 and 2: finals mode with the dedupe test, documents to the bucket. Deploy to Testing and turn off the night loop |
| Nov 13 | Step 3: statuses and contract 1.2.0. Step 5: settlement table and job |
| Nov 14 | Step 4: deadlines file, admin certification and recount entry. Step 6: spot checks |
| Ongoing | Record each state's certification as it happens (#153), into January |

## Done when

- Every one of the 470 races has a current snapshot from a full detail document, with counties.
- Each race shows one of the statuses above; no race shows "percent reporting" as share counted, and none
  shows 0 for unopposed.
- Every 2026 Kalshi race market is either in `market_settlements` or listed as not settled yet.
- Five states spot-checked against their official pages and recorded here. *Nov 12: two by machine (NC and GA, 30 races, all exact); CA, WV and AK need a check by hand, see "Spot checks".*
- Tests: finals pass (changed, unchanged, failed race), status derivation for each status, certification
  fan-out, settlement parsing. Section 7 checks pass.

## Built (Nov 12)

All six steps were built on Nov 12. Where the build differs from the plan above:

- **Statuses** are a new `finalStatus` object on each result (contract 1.2.0). The existing `certificationState` enum was
  not widened, so older 1.x clients that switch on it keep working. `CONTESTED` is its own status, beside `RECOUNT`.
- **"No change since"** comes from a new `result_snapshots.count_changed_at`, which moves only when the race-level
  totals change. The first finals pass republishes every race with its counties; without the column every race
  would have read "still counting". Existing snapshots were backfilled with their publish time.
- **Certification deadlines** are entered in the admin dashboard with their source, per state
  (`certification_deadlines`), not shipped in a file. NCSL blocks automated readers, and no date goes on the site
  without a source. Until a state's deadline is entered, its races show none.
- **Corrections:** a state's certified total that differs from civicAPI's is recorded as `CORRECTED` with the
  state's numbers in the notes; civicAPI's snapshot is never edited.
- **Kalshi settlement** fields could not be checked against Kalshi's docs (not reachable from development). The
  job records a market only when Kalshi's `result` reads yes, no or void, and logs the field names of the first
  settled market it cannot read. Settlements are linked to the 2026 race by state and district, because stored
  prices have no contest link.
- **Admin:** Certification section in the admin dashboard: per state, the deadline, "Record from the state"
  (certified, recount started or completed, contested, correction; state-wide or one race), undo latest entry, our
  totals to compare, the ranked-choice final round for AK and ME, and Kalshi markets that settled against the
  called winner.
- **Commands:** `npm run results:finals -- --states WV,GA` (one finals pass), `npm run check:finals -- --state WV`,
  `npm run sync:settlements`.

**Settings on `Backend`:** `CIVICAPI_FINALS_MODE=true` (with `RESULTS_INGESTOR_ENABLED` and, on Testing,
`RESULTS_INGESTOR_IN_PROCESS`); `RESULTS_ARTIFACT_BUCKET`, `_ENDPOINT`, `_REGION`, `_ACCESS_KEY_ID` and
`_SECRET_ACCESS_KEY` as references to the `db-backups` bucket. `KALSHI_SETTLEMENTS_ENABLED` is on by default.

## Spot checks (Nov 12)

Our stored totals are civicAPI's detail totals after the first finals pass. Each state's official results were
compared candidate by candidate with civicAPI's current aggregates on Nov 12, 4 PM ET:

| State | Source | Races | Result |
|---|---|---|---|
| NC | State Board of Elections results file (`er.ncsbe.gov/enr/20261103/data/results_0.txt`), 2,626 of 2,626 precincts reporting | Senate and 14 House | **All 15 match to the vote**, including the uncalled NC-05, NC-07 and NC-10 |
| GA | Secretary of State results (`results.sos.ga.gov`, election `11032026GeneralAndSpecialElection`), every county reporting | Senate and 14 House | **All 15 match to the vote**. The state shows 159 of 159 counties in for the Senate race while civicAPI's estimate reads 89.6%, which is why that estimate is no longer served |
| CA | `electionresults.sos.ca.gov` | | Not checked by machine: the site is behind bot protection. Check by hand in a browser |
| WV | Clarity results (`results.enr.clarityelections.com/WV/127496`) | | Not checked by machine: Clarity refuses automated requests. Check by hand |
| AK | `www.elections.alaska.gov` | | Not checked by machine: the site serves an incomplete TLS certificate chain. Check by hand; its ranked-choice final round is entered by hand anyway |

For the three left, open the state's page and compare it with the admin dashboard's "our totals" for the state
(or `npm run check:finals -- --state CA` in the `Backend` container).

## Decisions (recommended answers in bold)

1. **Label "unofficial, no change since a date" rather than "final, uncertified".** We cannot tell when
   a state has finished counting, so "final" would be a guess.
2. **County detail for all 470 races**, every 6 hours, until certification.
3. **Certification entered by hand with a source link**, per state, from a deadlines file. No source offers
   it as data.
4. **Alaska ranked-choice results entered from the state**, shown beside first-choice votes.
5. **Louisiana runoffs (Dec) are out of scope here.** They are separate contests; the ingestor's race list
   would need them added. Note them as "Runoff" until then.
