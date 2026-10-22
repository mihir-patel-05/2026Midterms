# Map geometry sources

| File | Source | Vintage | How it is produced |
| --- | --- | --- | --- |
| `us-atlas/states-10m.json` (npm) | U.S. Census Bureau cartographic boundaries via [us-atlas](https://github.com/topojson/us-atlas) | 2017 1:10m | Bundled by Vite from `node_modules` |
| `us-atlas/counties-10m.json` (npm) | Same as above | 2017 1:10m | Bundled by Vite and fetched only when the counties layer opens |
| `county2024.topo.json` (this folder) | U.S. Census Bureau `cb_2024_us_county_5m` | 2024 | `npm run build:geo:counties`; commit the output. Until it exists, the map falls back to `us-atlas/counties-10m.json` |
| `cd119.topo.json` (this folder) | U.S. Census Bureau `cb_2024_us_cd119_500k` (119th Congress) | 2024 | `npm run build:geo`; commit the output |

`cd119.topo.json` was built on 2026-10-05 (436 shapes: 435 seats plus DC). If it is ever
missing, the House-districts layer shows a "District boundaries unavailable" notice and the
rest of the map keeps working.

`county2024.topo.json` matches the ACS 2020–2024 demographics, so every county on the map has a
Census row. The 2017 us-atlas fallback still draws Connecticut's 8 old counties, which no longer
exist in Census data (Connecticut has reported by 9 planning regions since 2022), and Alaska's
Valdez-Cordova Census Area, which was split in 2019. Selecting those shows "no Census data".

Several states adopted new congressional maps for the 2026 elections after the 119th
Congress vintage, and the Census Bureau has not published 120th Congress boundaries yet.
Those states are listed in `src/features/election-monitor/map/redistricting-2026.json` and
drawn with dashed amber outlines. Contest data from the API stays authoritative for which
districts are on the ballot.

## 2026 redistricting flags and address lookup

Geocodio's `cd120` append reports the district an address falls in under the 2026 maps, but
it returns no boundary shapes, so it cannot replace the outlines above. It is used two ways:

- **Address search** (`GET /api/districts/lookup`, backend `GEOCODIO_API_KEY`): the top-bar
  search resolves an address or ZIP to its 2026 district.
- **Flagged states**: `GEOCODIO_API_KEY=... npm run build:redistricting` looks up one interior
  point per district under today's lines (`cd119`, a control) and the 2026 lines (`cd120`),
  and flags states where a point lands in a differently numbered district. A run bills about
  1,750 or more lookups, so check the day's Geocodio allowance first, then review and commit
  the JSON. Last run on 2026-10-22, which flagged CA, FL, MO, NC, OH, TN, TX, and UT. 37 of the
  436 sample points fell outside their own district on the simplified outlines and were
  skipped, and a redraw that keeps every sampled point's number goes unseen, so states can
  be added by hand in `MANUAL_STATES`. AL and LA are there: both redrew after *Louisiana v.
  Callais*, and Louisiana's May 2026 map was not yet in Geocodio's `cd120` data.
