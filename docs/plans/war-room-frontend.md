# War Room frontend: rebuild the monitor's look without breaking the live site

## Context
The War Room mockups ([design canvas](https://claude.ai/artifact/5RXPDbBB9FFNQWExCYcUss), private until shared) redesign the election monitor as an operations dashboard. The look is dark panels, monospace readouts, amber for alerts and selection, cyan for live feeds, and targeting brackets on the selected race. There are four screens:

| Screen | What it is |
|---|---|
| **Command** | The home page. Chamber-control prices and seat tallies, a real map (states or House districts; market leader, seat holder, or flip watch), a target card for the selected race, a watchlist, biggest movers, an activity feed, tipping-point races, and a FRED ticker. |
| **Race dossier** | One race: candidates side by side, market history, candidate and outside money, past margins, ACS profile, and a race log. |
| **Election night** | Called seats per chamber, poll-closing timeline, key-races board, call log, live streams, and system health. |
| **Signals** | 30-day chamber-control charts, movers, House tipping points, outside spending by race, FRED tiles, and data coverage. |

Every number in the mockups is illustrative. The build uses only real data, or shows an honest empty state (see [Empty states](#empty-states-coming-soon-not-connected-unavailable)).

**Timing.** Today is Oct 29. Code freeze is **Oct 30**, and Oct 31 to Nov 2 is monitoring and reviewed data fixes only (§3). The current monitor is what voters will use on election night, so this plan **does not change it before Nov 3**:
- **Recommended:** build on a branch now and merge after the election. The War Room ships behind a flag that is off in production, at its own route. The home page becomes the War Room only at an explicit cut-over (Phase 5).
- **If you want it reachable on election night anyway:** only Phase 1 and the Command view, merged before the freeze, flag on in **staging only**. Production keeps the flag off.

## Ground rules: how nothing breaks

1. **A new route, not a rewrite.** The War Room lives at `/war-room/*`, lazy-loaded and gated by `VITE_FEATURE_WAR_ROOM`. `/` keeps rendering `ElectionMonitor` until the cut-over. With the flag off, the route doesn't exist and the War Room code is never downloaded.
2. **The flag is off by default**, unlike the other `VITE_FEATURE_*` flags, which default on. It turns on in staging first, and in production only at the cut-over.
3. **No backend changes in v1.** The War Room calls the same endpoints through the same hooks. The Kalshi stream is one module-level `EventSource` in `useKalshiLive.ts`, shared by every hook. The War Room must use those hooks and never open its own stream, so `api` and `market-feed` see no extra load. It adds no polling either: query keys and intervals stay as they are.
4. **Shared code changes are additive only.** Where the War Room needs something from a shared component (for example a map theme), it gets a new optional prop whose default is today's behaviour. `ElectionMonitor.tsx` and its composition are not edited before the cut-over.
5. **Styles can't leak.** Vite keeps a lazy chunk's CSS in the page after you navigate away. So:
   - Every War Room rule is either prefixed `.wr-` or scoped under `:root[data-skin="warroom"]`.
   - The shell sets `data-skin="warroom"` on `<html>` on mount and removes it on unmount. It goes on `<html>` rather than a wrapper div so Radix portals (tooltips, dialogs, toasts render into `<body>`) get the same tokens.
   - The IBM Plex fonts are imported from the War Room stylesheet only. The rest of the site keeps its fonts.
6. **The URL contract is shared.** War Room screens read and write the same query parameters as `useMonitorParams` (`state`, `district`, `districts`, `counties`, `office`, `layer`, `mode`, `ooffice`, `lat`/`lon`/`zoom`, …). Any monitor link works on the War Room by changing only the path, and back again.
7. **Every commit passes** `npm run lint -- --max-warnings 0 && npm run typecheck && npm test && npm run build` in `CODE/` (§7 and `ci.yml`).

## Empty states: coming soon, not connected, unavailable
No panel ever shows mock numbers in the build. Each panel without data shows one of three states:

| State | Meaning | Looks like |
|---|---|---|
| **Coming soon** | A feature you haven't built yet. The panel keeps its place in the grid so the layout doesn't shift when it lands. | Panel title, one line on what it will show, a "Coming soon" badge. No placeholder bars or figures. |
| **Not connected** | An outside source we don't have yet. | "Not connected" plus the source's name, as the current coverage rail does ("No provider connected"). |
| **Unavailable / loading** | The source exists but failed or hasn't loaded. | The existing pattern: a status line, never a zero. |

**Coming soon in v1:**
- **Tipping-point races, Senate and House.** These come from your 10,000-run Monte Carlo simulation, which you'll build separately (§4.1). Both the Command panel and the Signals panel ship as Coming soon. When the model is ready, a `VITE_FEATURE_TIPPING_POINT` flag swaps in the real panel. The "TIPPING POINT #2" chip on the dossier header is left out until then.
- **Win probability index** (§4.1). Wherever a panel would show it, it shows Coming soon.
- **"Why it moved"** on the dossier (Agent 3, §4.2).
- **Early vote tracker** (§4.1), if it gets a panel.

**Not connected in v1:**
- Live results and race calls (no licensed provider; see Known gaps in §2).
- Per-race news. National top stories exist behind `VITE_FEATURE_NEWS`, but per-race NYT coverage doesn't, and AP has no access.
- Live-stream video IDs until they are loaded Oct 31–Nov 2 (§4.7).
- Polls wherever the polls database isn't connected yet. `RacePolls` already shows its own notice in that case.

## What each mockup panel uses

Status key: **Real** means an existing hook or endpoint already serves it. **Derived** means computed in the frontend from real data by a new pure function with tests. **Needs endpoint** means a new backend route, which is out of v1 scope.

### Command
| Mockup panel | Source today | Status |
|---|---|---|
| Source band and feed chips (Kalshi, FEC, FRED, results) | `useKalshiStatus`, `useStateCounts` (`dataUpdatedAt`), `useEconIndicators`, `useResultsSourceStatus` | Real |
| Countdown to first polls closing, ET clock | `CanvasHeader` clock logic; first close is Nov 3, 18:00 ET | Real |
| Senate and House control prices | `useControlOdds` (`ControlOddsBanner`) | Real |
| Seat tally bars ("D 49 · R 51 by market leader") | `useOddsView` leaders + `SENATE_NOT_UP` (`races2026.ts`) | Derived. Label it as a count of market leaders, not a forecast. |
| Key figures (races on file, markets live, races priced, flip watch, under 60¢) | `useStateCounts`, `useKalshiMarkets`, `useOddsView` (`stats`, `flips`) | Real / Derived |
| Key figure "Outside $ 7D" (national total) | No national aggregate route; `/api/outside-spending/race` is per race | Needs endpoint. Leave it out of v1. |
| Theater map: Market leader | `ElectionMap` with the existing odds overlay (`useOddsView`) | Real |
| Theater map: Seat holder | `SENATE_RACES_2026` holders; `public/data/seat-holders-2026.json` for the House | Derived (new overlay) |
| Theater map: Flip watch | `oddsView.flips` plus leaders under 75¢ | Derived (new overlay) |
| States / Districts layers | Existing `states` and `districts` sources and the `layer` URL param | Real |
| Counties layer | Existing `counties` source | Real (the mockup only greys it out) |
| Target card | `oddsView.lookup`, `useRaceOdds`, `useMarketHistory` (14-day line), `races2026.ts`, `house-2024.json` margin | Real |
| Watchlist | New. Race codes kept in `localStorage` (wrapped in try/catch), with a default list. Per viewer; no backend. | Derived |
| Biggest movers | `useMarketMovers` (`MoversCard`) | Real |
| Intel feed | The `activity` items `ElectionMonitor` builds for `ActivityRail`, plus movers, plus `useTopStories()` (`features/news/topStories.ts`) when `newsEnabled` | Real. FEC 24-hour filings in the feed need a national recent-filings route, so they come later. |
| Polling average on the target card | `PollSummary` (`features/polls/`) | Real when `pollsEnabled` and the polls database is connected; otherwise its existing notice |
| Tipping point, Senate | Your Monte Carlo model | **Coming soon** |
| FRED ticker | `useEconIndicators` (`EconomyStrip`) | Real |

### Race dossier
| Mockup panel | Source today | Status |
|---|---|---|
| Header (open seat, holder, flip watch) | `races2026.ts`, `seat-holders-2026.json`, `useOddsView` | Real |
| Candidates, receipts, cash on hand | `useStateContests` (FEC), the data behind `FinanceTab` | Real |
| Outside money for and against, top spenders | `/api/outside-spending/race` (`OutsideSpendingCard`) | Real. Support and opposition are never netted. |
| Market history chart | `useMarketHistory(races, 14)` | Real |
| Polls and polling average (not in the mockup; add a panel) | `RacePolls` (VoteHub, behind `pollsEnabled`) | Real. Shows its own notice until the polls database is connected and synced. Keep VoteHub's CC BY 4.0 attribution. |
| Terrain (past margins) | `usePastYear` (president, Senate, House); MIT Election Lab | Real. Drop the governor row; it isn't in the MIT federal files. |
| ACS profile | `useDemographics` | Real. Shows the existing notice until the ACS sync has run. |
| Race log | Market history and movers for the race, plus FEC report dates | Real (partial) |
| Why it moved | Agent 3 | **Coming soon** |

The dossier opens at `/war-room/race/:code` (`NC-SEN`, `PA-07`). It does not replace `/elections/:state/:electionId` (`RaceDetail.tsx`) in v1.

### Election night
| Mockup panel | Source today | Status |
|---|---|---|
| Called seats, key-races board, call log | Results read model (`/api/v1`). Only fictional fixtures today (`VITE_RESULTS_PROVIDER_MOCK_ENABLED`). | **Not connected** in production. Built and tested in staging against the mock provider only. |
| Poll-closing timeline | New constant file of closing times, sourced from state election offices | Real once sourced |
| Live coverage | YouTube stream IDs (§4.7) | Not connected until the IDs are loaded |
| System health | Feed statuses we already have (Kalshi, results source) | Real (partial) |

### Signals
| Mockup panel | Source today | Status |
|---|---|---|
| Chamber control, 30 days | `GET /api/prediction-markets/history?race=US-HOUSE,US-SENATE&days=30` (30 is the API's maximum) | Real. History starts Oct 14, so the chart begins there, with gaps left as breaks. |
| Biggest movers, 7 days | `useMarketMovers("7d")` | Real |
| Tipping point, House | Your Monte Carlo model | **Coming soon** |
| Outside spending by race, 7 days | Per-race route only. Watchlist races (8 at most) can use `/api/outside-spending/race`; a national leaderboard needs an aggregate route. | Real for the watchlist; Needs endpoint for national |
| FRED tiles with history | `useEconIndicators`, `IndicatorHistoryDialog` | Real |
| Data coverage | The `coverage` items from `ActivityRail` | Real |

## Architecture

```
CODE/src/pages/WarRoom.tsx                 lazy entry; nested routes
CODE/src/features/war-room/
  WarRoomShell.tsx                         source band, top bar (search, countdown, clock, feed chips), icon rail; sets data-skin
  warRoom.css                              all War Room styles: .wr- classes and :root[data-skin="warroom"] tokens
  panels/Panel.tsx                         panel frame, optional corner brackets
  panels/ComingSoonPanel.tsx               the Coming soon state
  panels/NotConnectedPanel.tsx             the Not connected state
  command/CommandView.tsx                  ChamberControl, KeyFigures, TheaterMap, TargetCard, Watchlist, IntelFeed, MacroTicker
  dossier/RaceDossier.tsx
  night/NightOps.tsx
  signals/SignalsView.tsx
  seatTally.ts (+ .test.ts)                market-leader counts per chamber
  holderOverlay.ts (+ .test.ts)            seat-holder and flip-watch bins for ElectionMap
  countdown.ts (+ .test.ts)                T-minus and poll-close formatting in ET
  watchlist.ts (+ .test.ts)                parse, validate, and store watchlist codes
```

**The map is the existing MapLibre `ElectionMap`.** The SVG map in the mockup was a stand-in for the design canvas. The live map already has the states, districts and counties sources, overlays, hatching, Senate labels and callouts, selection, and URL camera state. The War Room needs:
- **A `theme` prop** on `ElectionMap`. Selection and line colours are hard-coded JS constants today (`COLORS` near the top of `ElectionMap.tsx`), and MapLibre paint can't read CSS variables. The prop's default is exactly today's `COLORS`, so `/` doesn't change.
- **Two overlays**, Seat holder and Flip watch, as pure functions returning the same `MapOverlay` shape the odds and past-results overlays use.
- **Targeting brackets** around the selected race, drawn as an HTML overlay positioned with `map.project()` on the feature's bounding box and updated on `move`. No new map layer is needed.
- **Alaska and Hawaii** stay as today. The mockup's inset boxes are optional, for later.

**Theme tokens** (all under `:root[data-skin="warroom"]`):
- Ground `#06080B`, panel `#0B0F14`, line `#1C2530`.
- Text `#DCE3EA` / `#A3AFBC` / `#8593A3`. All pass 4.5:1 on the panel colour.
- Accent `#FFB020`, live `#3DD6D0`.
- The skin also redefines `--signal-blue` and `--signal-coral` (D `#5AA9FF`, R `#F2554A`), so shared components that use `partyTone` (`PredictionMarketsPanel`, `RaceCard`) pick up War Room party colours inside the War Room only.
- The odds and past-results ramps (`ODDS_COLORS`, `BIN_COLORS`) keep their tested values.

**Mobile:** the icon rail becomes a top row, panels stack, and wide tables scroll inside their panel. Check at 390 px.

## Commits (each passes `npm run lint -- --max-warnings 0`, `npm run typecheck`, `npm test`, `npm run build` in `CODE/`)

### Phase 0: plan
0. `docs(plans): War Room frontend`. This file, plus a row in PLAN.md §4.1.

### Phase 1: scaffold, invisible in production
1. `feat(war-room): flag, lazy route and shell`
   - `lib/featureFlags.ts`: `warRoomEnabled = import.meta.env.VITE_FEATURE_WAR_ROOM === "true"`, with a comment saying why it defaults off.
   - `CODE/Dockerfile`: add `ARG VITE_FEATURE_WAR_ROOM`. Without it, the Railway build arg never reaches `vite build`; the existing on-by-default flags don't need one, but an off-by-default flag does.
   - `.github/workflows/frontend-deploy.yml`: pass `VITE_FEATURE_WAR_ROOM: ${{ vars.VITE_FEATURE_WAR_ROOM || 'false' }}`, if that workflow is still used alongside Railway.
   - `App.tsx`: `<Route path="/war-room/*">` only when the flag is on, in a `Suspense` like the simulator routes. nginx already falls back to `index.html` for unknown paths, so no server change.
   - `WarRoomShell.tsx` and `warRoom.css` (tokens, band, top bar, rail).
2. `feat(war-room): panel kit and empty states`. `Panel`, `ComingSoonPanel`, and `NotConnectedPanel`, plus `countdown.ts` and its tests.

### Phase 2: Command
3. `feat(map): optional theme for ElectionMap`. Additive prop; the default is today's `COLORS`. Check `/` looks the same.
4. `feat(map): seat-holder and flip-watch overlays`. `holderOverlay.ts` and tests: Senate holders, House holders, vacancies, redistricted seats never flip (same rule as the odds map), and at-large `DE-00`.
5. `feat(war-room): command view`. Chamber control, seat tally (`seatTally.ts` and tests), key figures, theater map, target card, watchlist (`watchlist.ts` and tests), movers, intel feed, FRED ticker, and the Senate tipping point as `ComingSoonPanel`.

### Phase 3: dossier and signals
6. `feat(war-room): race dossier`. Route `/war-room/race/:code`; "Why it moved" is `ComingSoonPanel`.
7. `feat(war-room): signals`. Chamber control over 30 days, 7-day movers, outside spending for watchlist races, FRED tiles, coverage, and the House tipping point as `ComingSoonPanel`.

### Phase 4: election night (staging only until a results provider is live)
8. `feat(war-room): election night view`. Poll-closing constants with sources, and the key-races board and call log on the results read model. Production shows `NotConnectedPanel` until a provider is licensed. Before embedding streams, check `nginx.conf` and any CSP for `frame-src` (use `youtube-nocookie.com`).

### Phase 5: cut-over, after the election
9. `feat: make the War Room the home page`
   - With the flag on, `/` renders the War Room.
   - The current monitor moves to `/monitor` for one release, as the fallback. The existing `/election-dashboard` redirect keeps working.
   - Remove the old monitor in a later release, together with the legacy frontend already listed under Known gaps (§2).
10. `docs(plan): War Room shipped`

## Verification
- **CI on every commit:** lint (zero warnings), typecheck, vitest, build.
- **Flag off (the production default):**
  - `/war-room` shows the 404 page.
  - `/` behaves exactly as before.
  - In `npm run build` output, the War Room code is its own chunk, and the entry chunk's size is within a few KB of the base branch's (`2026Midterm_intel_v2`; every PR targets it, never `main`, per §7).
- **Flag on, in staging:**
  - Each screen at 1440 px and 390 px wide.
  - Keyboard navigation and visible focus.
  - Reduced motion stops the ticker and the live-dot pulse.
- **No leaks:** open `/war-room`, then go to `/`, `/elections`, `/candidates` and `/simulator`. None of them should show amber, Plex fonts, or the War Room background.
- **One stream:** in devtools, exactly one EventSource to `/api/prediction-markets/kalshi/stream`, while moving between `/` and `/war-room`.
- **Portals:** open a tooltip and `IndicatorHistoryDialog` inside the War Room; they use War Room tokens.
- **Empty states:** with the API stopped in dev, every panel shows unavailable or loading, never a zero. Coming soon panels show no figures at all. Testing's main database was replaced with an empty one on Oct 29 (§5.5), so staging will show many empty panels until the syncs refill it. That is a useful check of the empty states, not a bug in the War Room.
- **Map:** `/` still uses the default theme (teal selection). The War Room map uses amber selection and brackets. Shift-click multi-select and the URL camera state work on both.

## Rollback
- **Before the cut-over:** nothing to roll back. Production has the flag off.
- **After the cut-over:** set `VITE_FEATURE_WAR_ROOM=false` on the Railway `web` service and rebuild (`VITE_*` values are build-time). For an instant rollback, redeploy the previous `web` deployment in Railway. The old monitor stays in the bundle for one release for exactly this.

## Critical files
- `CODE/src/App.tsx`, `CODE/src/main.tsx`, `CODE/src/lib/featureFlags.ts`, `CODE/Dockerfile`, `.github/workflows/frontend-deploy.yml`
- `CODE/src/features/election-monitor/map/ElectionMap.tsx` (additive `theme` prop only)
- `CODE/src/features/election-monitor/useKalshiLive.ts`, `useMonitorParams.ts`, `oddsMap.ts`, `marketHistory.ts`, `economy.ts`, `realData.ts` (reused, not changed)
- `CODE/src/features/polls/` (`PollSummary`, `RacePolls`) and `CODE/src/features/news/topStories.ts` (reused, not changed)
- `CODE/src/features/simulator/midterms/races2026.ts`, `CODE/public/data/seat-holders-2026.json`, `CODE/public/data/past-results/house-2024.json`
- `CODE/src/index.css` (unchanged; the War Room's tokens live in `warRoom.css`)

## Open questions
- **Default watchlist.** Which races, and should it become per account once chatbot sign-in exists (§4.12)?
- **Seat tally.** Ship the "D 49 · R 51 by market leader" count on the Command screen, or only the control prices? It counts market leaders and must never be presented as a forecast.
- **Alaska and Hawaii insets** on the MapLibre map, or keep today's behaviour?
- **Election night view.** Worth building before a results provider is chosen, or wait until then?
