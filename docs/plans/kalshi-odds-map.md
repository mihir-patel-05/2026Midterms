# Kalshi odds map: colour every Senate state and House district by its market

## Context
The monitor map can show the 2026 readiness view or Past results, but it can't show where the markets think each race is heading. Users want a Kalshi-style overlay (see the two screenshots): pick **Senate** (by state) or **House** (by district), and colour each race blue or red. A paler shade means a close race and a saturated shade means the market is near certain. Hatching marks a race whose leader differs from the party holding the seat.

Decisions you made:
- A **third map mode, "Market odds"**, next to "2026 races | Past results", with a Senate / House picker. It reuses the existing map, tooltip, expand/fullscreen, and URL state.
- **Kalshi-style shading**: pale = toss-up, saturated = safe. This needs its own ramp; the Past results ramps run the other way.
- **Redistricted states (TX)**: colour by the market for that district number, keep the dashed amber outline, and warn in the tooltip and legend that the shapes are 2024 lines.

What already exists (no backend work needed):
- `useKalshiMarkets()` in `CODE/src/features/election-monitor/useKalshiLive.ts` already streams **every** tracked market over SSE, grouped by race in `byRace` (`GA-SEN`, `PA-07`, `DE-00`). Each market has `party` (`D`/`R`/null), `pricePercent`, `priceType`, and `updatedAt`.
- `ElectionMap.tsx` already colours features through feature state (`past` bins → a `match` paint expression) on the `states` and `districts` sources. Past results drives it today.
- 2026 seat holders: Senate comes from `SENATE_RACES_2026[code].holder` (`features/simulator/midterms/races2026.ts`). House comes from `houseBaseline(house-2024.json)` (`features/simulator/midterms/model.ts`) via `usePastYear("house", 2024)`.
- `REDISTRICTED_STATES` / `isRedistricted` (`map/redistricting.ts`), the `districts-outdated-line` layer, and `districtLabel`, `priceTypeLabel`, and `formatEtTime` (`constants.ts`).

## Rules for the colours (pure functions, unit-tested)
- **Leader** = the race's priced outcome with the highest `pricePercent`. The leader's party comes from `market.party`; `null` (an independent such as NE's Osborn) → `O`.
- **Bin** = `${party}${i}` with `ODDS_BREAKS = [60, 75, 90]` on the leader's price: `<60`, `60–75`, `75–90`, `90+`. Bin 0 is the palest and bin 3 the most saturated.
- **Statuses** (grey, never treated as 50/50):
  - `no_race`: a Senate state with no 2026 race, or DC.
  - `no_market`: a race with no open Kalshi market.
  - `no_price`: the markets exist but none has a price yet.
- **Flip** = the leader's party ≠ the holder's party. House seats in redistricted states are never marked as flips, because their 2024 holder belongs to different lines.
- Labelled everywhere as "market price, not a forecast", with the price type and the time of the last change (PLAN.md §1 principles).

## Commits (each passes `npm run typecheck`, `npm run lint`, `npm test`, `npm run build` in `CODE/`; no push without asking)

### 0. `docs(plans): Kalshi odds map`
- Add `docs/plans/kalshi-odds-map.md` (this plan, in the same format as `docs/plans/state-fred-indicators.md`).

### 1. `refactor(map): drive ElectionMap colouring from a generic overlay`
No behaviour change, so Past results looks the same afterwards.
- `map/ElectionMap.tsx`:
  - Replace the `past?: { bins } | null` prop with `overlay?: { bins: Map<string,string> | null; colors: Record<string,string>; fallback: string } | null`.
  - Build the `match` expression from `overlay.colors` in place of the module-level `pastColor`.
  - Rename the feature-state key `past` to `bin`, and the related names (`pastOn`/`pastPainted`/`pastApplied` → `overlayOn`/…).
  - Make the bins effect **diff** against the previously applied map, so only changed codes get a `setFeatureState`. Live quotes tick about once a second.
- `ElectionMonitor.tsx`: pass `{ bins: past.bins, colors: BIN_COLORS, fallback: STATUS_COLORS.not_reported }`.

### 2. `feat(monitor): colour bins from Kalshi race markets`
- New `CODE/src/features/election-monitor/oddsMap.ts`:
  - `OddsOffice = "senate" | "house"`, `ODDS_BREAKS`, and `ODDS_COLORS` (D/R/O × 4 plus the greys).
    - Load the **`dataviz` skill** before picking the ramps.
    - Pale to saturated, checked on the dark basemap. Keep O on its own hue, as in Past results.
  - `raceLeader(markets)`, `oddsBin(leader)`, and `isFlip(leader, holder, redistricted)`.
  - `buildOddsView(byRace, office, houseHolders)` returns:
    - `bins: Map<code, bin>` (state codes for the Senate; `ST-DD` for the House, matching the `districts` source `code`).
    - `flips: Set<code>`.
    - `lookup(code)` → `{ markets, leader, holder, flip, redistricted }`, for the tooltip.
    - `stats`: counts of races with a market or a price.
    - `lastChange` and `priceType`, for the caption.
  - `useOddsView(active, office)` wraps `useKalshiMarkets()`, plus `usePastYear("house", 2024)` + `houseBaseline` only when the office is House.
- `lib/featureFlags.ts`: `oddsMapEnabled = VITE_FEATURE_ODDS_MAP !== "false"` (on by default, like the other flags).
- New `oddsMap.test.ts` covers:
  - the leader, bin edges (59.9/60/75/90), and an independent leader → `O`.
  - a market with no price → `no_price`, and no market → `no_market`.
  - a Senate state with no race → `no_race`.
  - a flip versus a hold, and a redistricted seat never flips.
  - at-large `DE-00`.

### 3. `feat(monitor): Market odds map mode for the Senate and House`
- `types.ts`: `MapMode = "races" | "past" | "odds"`.
- `useMonitorParams.ts`: accept `mode=odds`; add `oddsOffice` ↔ the URL `ooffice` (default `senate`, left out of the URL when it is the default).
- `MapCard.tsx`:
  - Add the third button "Market odds" (shown when its flag is on).
  - Generalise `pastControls`/`pastLegend` into `modeControls`/`modeLegend`, shown for any non-`races` mode.
  - Set the title, description, and caption per mode. The odds caption reads: "Kalshi market prices (bid/ask midpoint), last changed 4:12 PM ET. Not forecasts or results."
- New `OddsControls.tsx`: a Senate / House segmented control (same `em-seg` styling as `PastResultsControls`) and a "N of M races priced" readout.
- New `OddsLegend` (in the same file):
  - a D / R / Ind. × `<60 · 60–75 · 75–90 · 90+` swatch table (reuse the `Swatch`/`em-past-ramp` markup from `PastResultsControls.tsx`).
  - the greys.
  - a "How this is calculated" `<details>` block.
  - with House selected and a redistricted state on the map, the note "Texas adopted new districts for 2026; shapes are 2024 lines, colours are the 2026 market for that district number."
  - when the feed is `offline`/`disabled` and there are no markets: "Live Kalshi feed unavailable."
- `ElectionMonitor.tsx`:
  - `oddsActive`, `useOddsView`, and `mapLayer` (`senate` → `states`, `house` → `districts`).
  - `overlay` uses `ODDS_COLORS`.
  - `setMode` moves the tab off `history` when odds mode is entered.
  - In the expanded HUD, odds mode shows `ControlOddsBanner` only.
  - `describe()` gets an odds branch that returns the title plus lines:
    - each outcome and its price (`Democratic 72% · Republican 29%`).
    - "Leader differs from the party holding the seat (R)" when it is a flip.
    - the redistricted warning for TX.
    - "No open Kalshi market" or "No Senate race in 2026" for the grey areas.
  - Clicking still selects the state or district, so the existing race card and markets panel show the detail.
- `monitor.css`: the small additions the new controls and legend need.

### 4. `feat(map): hatch races whose market leader would flip the seat`
- `ElectionMap.tsx`:
  - On load, `map.addImage("overlay-hatch", …)` with diagonal white stripes on a transparent canvas, 8px, at device pixel ratio.
  - Add the `states-hatch` and `districts-hatch` fill layers (`fill-pattern: "overlay-hatch"`) right above their fills. Their `fill-opacity` is `["case", ["boolean", ["feature-state","flip"], false], 0.55, 0]`, and they follow the same visibility and state filter as the fills.
  - `overlay` gains an optional `hatch: Set<string>`, applied as the `flip` feature state with the same diff approach as the bins.
- `OddsLegend`: a hatched swatch, "Leader differs from the party holding the seat"; CSS hatch via `repeating-linear-gradient`, like `.em-swatch[data-layer="districts"]`.

### 5. `feat(map): state labels with the leader's price on the Senate odds map`
- `ElectionMap.tsx`:
  - An optional `labels?: Map<code, string>` prop (e.g. `"MT\n93%"`) feeds a `states-labels` symbol layer on its own GeoJSON source: the state polygons with a `label` property. MapLibre places polygon labels at the pole of inaccessibility.
  - Throttle `setData` to about once every 2 s.
  - Skip the layer when the style has no `glyphs` (the fallback basemap).
- Small Northeast states (VT, NH, MA, RI, CT, NJ, DE, MD) get an HTML side list like Kalshi's call-out column. It sits in the map frame, shows each state's code, leader, and price in its bin colour, and selects the state on click.
- Senate odds only; House districts are too dense to label.

### 6. `docs(plan): Kalshi odds map shipped`
- `PLAN.md` §2 "Shipped": a bullet for the odds map (modes, bins, flips, TX caveat, flag `VITE_FEATURE_ODDS_MAP`).

## Critical files
- `CODE/src/features/election-monitor/map/ElectionMap.tsx`: generic overlay, hatch layers, labels.
- `CODE/src/features/election-monitor/ElectionMonitor.tsx`: mode wiring, tooltip, HUD.
- `CODE/src/features/election-monitor/MapCard.tsx`, `types.ts`, `useMonitorParams.ts`.
- New: `oddsMap.ts`, `oddsMap.test.ts`, `OddsControls.tsx`.
- Reused: `useKalshiLive.ts`, `pastResults.ts` (`usePastYear`, `Swatch` pattern), `simulator/midterms/races2026.ts`, `simulator/midterms/model.ts` (`houseBaseline`), `map/redistricting.ts`, `constants.ts`.

## Verification
- `cd CODE && npm run typecheck && npm run lint && npm test && npm run build` after every commit.
- After commit 1, Past results must look the same: president by state and county, Senate 2024, and House 2024.
- Run the app with the backend's live Kalshi feed on, using the `run` skill. Check that:
  - `?mode=odds` shows the 35 Senate states coloured, the rest grey "No 2026 race", and the shades match the tooltips' prices.
  - `?mode=odds&ooffice=house` colours about 415 districts and leaves the rest "No open Kalshi market". TX keeps its dashed outline and has the tooltip warning.
  - known flips (e.g. NC, ME) are hatched.
  - prices tick live without flicker.
  - expand, fullscreen, the HUD, state selection, and the markets panel all work in odds mode.
  - the URL round-trips.
  - `VITE_FEATURE_ODDS_MAP=false` hides the button.
- With the feed stopped, the legend says the feed is unavailable and the map stays grey, never 50/50.

## Coverage fix (Oct 30)
The catalog found 449 of the 475 races: same-party and top-two generals (CA-07 has two Democrats) are not in `KXHOUSERACE`, but in a per-state series, one event per district (`KXCAELECTION-2607`).
- `buildCatalog` now also reads `KX{ST}ELECTION` for every state, after `KXHOUSERACE` and before the per-district `HOUSE{ST}{N}-26` probes. `parseStateElectionEvent` accepts only a district that exists in the state, and refuses titles naming another office. Every other event in those series is logged once as "not a House race".
- Those markets name candidates, not parties, so `assignParties` sets the party from a "(D)"/"(R)" tag or from the race's candidate with that name (the ballot, else FEC filers). Independents keep a null party.
- The feed logs the ballot races that still have no open market whenever that list changes.

