# New frontend rollout

The VoteInformed web app (`CODE/`) now ships the dark "election monitor" design from
`docs/prototypes/election-dashboard-poc.html`. That means a new app shell and theme on
every page, an interactive MapLibre map, and the dashboard as the home page.

## Switches

| Variable (build time) | Default | Effect |
| --- | --- | --- |
| `VITE_FEATURE_NEW_FRONTEND` | on (anything except `false`) | New shell, theme, and the dashboard at `/` |
| `VITE_MAP_STYLE_URL` | CARTO Dark Matter | Basemap style JSON for the map |
| `VITE_RESULTS_PROVIDER_MOCK_ENABLED` | `false` | Fictional results fixtures plus the site-wide mock banner |
| `VITE_FEATURE_ELECTION_DASHBOARD` | `false` | Legacy flag; only used when the new frontend is off |

Vite inlines these at build time, so a change needs a rebuild and redeploy.

- **GitHub Actions / Vercel** (`frontend-deploy.yml`): repository variables
  `VITE_FEATURE_NEW_FRONTEND` and `VITE_MAP_STYLE_URL`.
- **Railway / Docker** (`CODE/Dockerfile`): service variables with the same names. They
  are declared as build `ARG`s.

## Rollback

1. Set `VITE_FEATURE_NEW_FRONTEND=false` for the frontend service or repository.
2. Redeploy the frontend. No backend or database change is involved.

With the flag off the site is the legacy frontend:
- `/` is the old landing page.
- `/election-dashboard` is the flagged beta dashboard.

With the flag on, the old landing page stays reachable at `/classic` for comparison.

## Routes with the flag on

| Path | Page |
| --- | --- |
| `/` | Election monitor. State, district, office, contest, layer, tab and map camera are in the query string (`?state=MI&district=07&layer=districts&lat=…&lon=…&zoom=…`) |
| `/election-dashboard` | Redirects to `/`, keeping the query string |
| `/classic` | Legacy landing page (remove next release) |
| Everything else | Unchanged routes, rendered in the new shell |

## Data the dashboard shows

- **Contests, candidates and race counts** come from `/api/elections/*`. Only
  general-election contests are shown.
- **Finance** comes from `/api/candidates/:id/finances/detailed`. These are the same
  totals as the candidate profile page.
- **Results** appear only when the mock provider is enabled, and only for the fictional
  "EX" state. No live provider exists, so the UI says "No results provider connected"
  and never shows zero totals.
- **Prediction markets** use `/api/prediction-markets` (Kalshi and Polymarket).

## Known gaps

- **District boundaries are not committed.** Run `npm run build:geo` in `CODE/` on a
  machine with internet access, then commit `CODE/public/geo/cd119.topo.json`. It
  downloads the Census `cb_2024_us_cd119_500k` shapefile. Until then the House-districts
  layer shows "District boundaries unavailable". See `CODE/public/geo/SOURCES.md` for
  the 2026 redistricting caveat.
- **No outside-spending data.** The backend has no independent-expenditure source, so
  the Finance tab says it is not available.
- **No results or finance map shading.** Results-margin and finance-coverage shading
  need a real results provider and national finance coverage. The map layers are states,
  districts and counties.
- **Basemap needs network access.** The basemap is fetched from CARTO. If that fails,
  the map falls back to boundaries on a plain background.

## Follow-up release: remove the legacy frontend

Once the new frontend has been live for a release without a rollback:

- Delete `components/layout/Navbar.tsx`, `components/layout/Footer.tsx`,
  `components/home/*`, `pages/Index.tsx` and the `/classic` route.
- Delete `features/election-dashboard/ElectionDashboardShell.tsx`,
  `DashboardControls.tsx`, `NationalMap.tsx`, `RaceList.tsx`, `RaceDetailPanel.tsx`,
  `DataStateNotice.tsx`, `SourceFreshnessIndicator.tsx`, and the
  `LivePredictionDashboard` branch of `pages/ElectionDashboard.tsx`.
- Move `PredictionMarketsPanel`, `mockApi.ts`, `types.ts` and the prediction-market
  styles into `features/election-monitor/`.
- Drop `react-simple-maps`.
- Remove `VITE_FEATURE_NEW_FRONTEND`, `VITE_FEATURE_ELECTION_DASHBOARD` and the legacy
  `:root` / `.dark` palettes in `index.css`.

## Verifying a build

- In `CODE/`, run `npm run lint -- --max-warnings 0 && npm run typecheck && npm run build`.
- Run `npm run dev` against a backend. Then check:
  - Clicking a state and choosing it in the Location select both fly the map and fill
    the detail panel.
  - Each layer button works.
  - The Overview, Counties and Finance tabs all render.
  - `/` focuses search, and `MI-7` jumps to that district.
  - Deep links like `/?state=TX&district=22` restore the view.
  - `/election-dashboard?state=MI` redirects.
- With the backend stopped, panels show "unavailable" states, not zeros.
