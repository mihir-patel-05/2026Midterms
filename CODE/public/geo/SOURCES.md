# Map geometry sources

| File | Source | Vintage | How it is produced |
| --- | --- | --- | --- |
| `us-atlas/states-10m.json` (npm) | U.S. Census Bureau cartographic boundaries via [us-atlas](https://github.com/topojson/us-atlas) | 2017 1:10m | Bundled by Vite from `node_modules` |
| `us-atlas/counties-10m.json` (npm) | Same as above | 2017 1:10m | Bundled by Vite and fetched only when the counties layer opens |
| `cd119.topo.json` (this folder) | U.S. Census Bureau `cb_2024_us_cd119_500k` (119th Congress) | 2024 | `npm run build:geo`; commit the output |

`cd119.topo.json` was built on 2026-10-05 (436 shapes: 435 seats plus DC). If it is ever
missing, the House-districts layer shows a "District boundaries unavailable" notice and the
rest of the map keeps working.

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
  the JSON. The committed file is provisional (Texas only, confirmed by a direct lookup) until
  the script has been run in full.
