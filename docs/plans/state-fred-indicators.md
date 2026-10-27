# State-level FRED indicators + history chart dialog

## Status
Shipped Oct 16 and merged to `main`. Every planned commit landed:

- [x] Plan (`c786fd6c`)
- [x] 1. Pace FRED requests under the 120/min limit (`198a893f`)
- [x] 2. State unemployment, jobs, claims, GDP, and home price series (`8d80efe5`)
- [x] 3. `GET /api/indicators?state=CA` (`06b14492`)
- [x] 4. Economy strip follows the selected state (`39f6e1c5`)
- [x] 5. History chart dialog for each indicator (`29e7249d`)
- [x] 6. PLAN.md section 4.11 (`1d9ae78c`)

## Context
The economy strip (shipped Oct 15, PLAN.md §4.11) only shows national FRED series. When a user picks a state on the monitor, the strip should narrow to that state, and any tile should open a larger history chart, comparing the state against the U.S. when a state is selected.

Decisions you made:
- Sync 5 state series for the 50 states + DC: unemployment, jobs added, jobless claims, GDP growth, and home prices.
- With a state selected, **hide** the tiles that only have U.S. data.
- The history chart opens in a **dialog**.

## Data (FRED IDs, `{ST}` = postal code, 50 states + DC)
| Tile | State series | U.S. counterpart | Transform |
|---|---|---|---|
| Unemployment | `{ST}UR` monthly, BLS LAUS | `UNRATE` | level |
| Jobs added | `{ST}NA` monthly, BLS CES (thousands) | `PAYEMS` | mom_change |
| Jobless claims | `{ST}ICLAIMS` weekly, DOL, **not seasonally adjusted** | `ICSA` | level |
| GDP growth | `{ST}RQGSP` quarterly, BEA real GDP level | `A191RL1Q225SBEA` | **new `qoq_annualized`** |
| Home prices (new tile) | `{ST}STHPI` quarterly, FHFA | **new** `USSTHPI` | yoy |

That is 255 state series plus 22 national ones, so about 277 requests per run (about 4 minutes once the requests are paced). There is no Prisma migration: state series are ordinary `indicator_series` rows keyed `fred.CAUR` etc.

## Commits (each passes typecheck/build/tests on its own; no push without asking)

### 1. `feat(fred): pace FRED requests under the 120/min limit`
- `backend/src/services/fred/fred-client.ts`: add a `minIntervalMs` option (default 600 ms, about 100 requests a minute) that waits between requests, retries included. Tests pass `minIntervalMs: 0`.
- `fred-client.test.ts`: test the spacing with a fake clock or a short interval.

### 2. `feat(fred): state unemployment, jobs, claims, GDP, and home price series`
- `series-catalog.ts`:
  - add `stateCode: string | null` and an optional `staleAfterDays` to `FredSeriesDef`.
  - add `FRED_STATE_CODES` (50 + DC, derived from `STATE_FIPS_TO_POSTAL` in `services/census/census-client.ts`, minus PR).
  - build `FRED_STATE_SERIES` from 5 templates, add `USSTHPI` nationally, and bump `FRED_CATALOG_VERSION` to `fred-indicators-v2`.
  - export `FRED_SERIES` as national + state, plus a `stateSeries(code)` helper.
  - state claims get `staleAfterDays: 21`, because state claims run a week behind the national figures and would otherwise show "Stale" every Wednesday.
- `indicator-math.ts`:
  - add the `qoq_annualized` transform: `((v / prev) ** 4 − 1) × 100`, null unless `prev` is exactly the prior quarter. Wire it into `changeAt`, so `changeHistory` gets it for free.
  - `isStale` honours `def.staleAfterDays` and falls back to `STALE_AFTER_DAYS[frequency]`.
  - `IndicatorView` gains `stateCode`.
- `fred-sync.ts`: no logic change. Update `coverageDescription` in the `dataSource.update` call too, so existing databases pick up the new text. `scripts/sync-fred.ts`: fix the "about 20" request comment.
- Tests: `indicator-math.test.ts` covers `qoq_annualized` (including a skipped quarter giving null) and the stale override. Add a catalog test (51 × 5 state defs, unique keys, unique IDs).

### 3. `feat(fred): serve a state's indicators at GET /api/indicators?state=CA`
- `routes/indicators.routes.ts`: add an optional `state` to `indicatorsQuery` (two uppercase letters, uppercased before checking; anything else is a 400).
- `indicator-read.ts`: `getIndicators(db, { …, state })` reads the national defs plus `stateSeries(state)` in the same `findMany`. The response adds `state: { code, supported, series: IndicatorView[] } | null`:
  - `supported: false` for codes FRED has no state series for (PR, the fictional state).
  - `NOT_LOADED` still keys off the national rows only.
  - The `Cache-Control` header stays as it is.
- Tests: route query parsing for `state`; in `fred-sync.db.test.ts`, extend the `getIndicators` assertions with a `fred-test` state def.

### 4. `feat(monitor): economy strip follows the selected state`
- `CODE/src/features/election-monitor/economy.ts`:
  - `useEconIndicators(days, stateCode)` adds `&state=` to the request and to the query key.
  - Add the `qoq_annualized` transform and `stateCode` to the types.
  - Each `TileSpec` gains an optional `state: { suffix: "UR" | …, show, format, changeFormat, basis, compare: "overlay" | "stacked" }`. Add a national Home prices tile (`USSTHPI`).
  - `buildTiles(data)` builds state tiles when `data.state?.supported`: only specs with a `state` entry, U.S.-only tiles dropped.
    - Each state tile carries `scope: "state"` and its U.S. counterpart (its value goes in the tooltip, e.g. "U.S.: 4.3%").
    - It falls back to "Not available" when the state series is empty.
  - Add `EconTile.chart` (full shown history, frequency, unit) and `EconTile.comparison` (U.S. points) for the dialog.
  - Formatters: small state counts need `fmt.signedThousands` with one decimal under 10K ("+0.4K", not "+0K"), and claims under 1,000 show the plain number.
- `EconomyStrip.tsx`:
  - takes `stateCode` and `stateName`.
  - shows a state label on the row and in the aria-label.
  - the footer names the state figures' sources, and notes that state claims are not seasonally adjusted.
- `ElectionMonitor.tsx`: pass `selectedState && !selectedState.isFictional ? selectedState.code : null` to both `<EconomyStrip>` uses (lines ~283 and ~306).
- `economy.test.ts`:
  - state tiles replace national ones and the U.S.-only tiles are hidden.
  - `supported: false` falls back to the national strip.
  - the small-number formats.
  - the U.S. comparison line in the tooltip.

### 5. `feat(monitor): history chart dialog for each indicator`
Load the `dataviz` skill before writing the chart code.
- New `IndicatorHistoryDialog.tsx`, using `components/ui/dialog.tsx`, `toggle-group.tsx`, and recharts through `components/ui/chart.tsx`:
  - The dialog fetches `useEconIndicators(1825, stateCode)`, the 5-year backfill, and finds the clicked tile with `buildTiles(...).find(id)`. 1Y / 2Y / 5Y ranges filter that data on the client.
  - Header: tile label, scope (state name or "United States"), latest value, period, change, stale pill.
  - Chart: a line in a neutral colour that breaks at missing periods. Move `GAP_MS` and `segments` out of `IndicatorSparkline.tsx` into a shared helper and insert nulls at the gaps.
  - With a state selected:
    - `compare: "overlay"` (unemployment, GDP growth, home prices): state and U.S. lines on one axis, with a legend.
    - `"stacked"` (jobs, claims, whose sizes aren't comparable): a state chart and a U.S. chart, each on its own axis.
  - Footer: the source line(s) and the existing "context, not a forecast" note.
- `EconomyStrip.tsx`: each tile becomes a button (Enter/Space/click) that opens the dialog. The hover tooltip stays. This works in the compact map overlay too.
- `monitor.css`: dialog and legend styles that follow the existing `em-econ-*` tokens, in both light and dark themes.

### 6. `docs(plan): state FRED indicators and history charts`
- PLAN.md §4.11: the state series table, the `qoq_annualized` transform, the claims stale override, request pacing, the `?state=` API, U.S.-only tiles hidden, the dialog. Add a "Shipped" line near line 73.

## Verification
- Backend: `npm run typecheck && npm test` in `backend/` (DB tests need `TEST_DATABASE_URL`). Frontend: `npm run typecheck && npm test && npm run build` in `CODE/`.
- A real sync needs `FRED_API_KEY` in `backend/.env`, which isn't set locally right now.
  - With it: `npm run sync:fred` should end `SUCCEEDED` with zero failed series. A wrong ID would leave the source `DEGRADED` on every run.
  - Run it a second time and confirm almost nothing changes.
- Spot-check `CAUR`, `TXNA` month-over-month, `NYRQGSP` annualized growth, and `FLSTHPI` year-over-year against fred.stlouisfed.org.
- `curl 'localhost:<port>/api/indicators?state=CA'`, then `?state=PR` (`supported: false`), then `?state=ZZZ` (400).
- In the app (run skill):
  - pick a state: 5 state tiles appear and the U.S.-only tiles disappear; clear the state and all 14 national tiles return.
  - click a tile: the dialog opens; switching ranges works; the U.S. overlay or stacked chart appears; gaps render; keyboard open and close work; check dark mode.
