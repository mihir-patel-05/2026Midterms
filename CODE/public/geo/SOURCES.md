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
Congress vintage. Until updated boundaries are published and rebuilt here, district
outlines in those states may not match the 2026 ballot. Contest data from the API stays
authoritative for which districts are on the ballot.
