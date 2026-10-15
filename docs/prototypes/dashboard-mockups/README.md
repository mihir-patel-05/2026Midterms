# Intel dashboard mockups

Two standalone design mockups for turning VoteInformed into a single dashboard for researchers, where every data stream (markets, polls, FEC money, outside spending, economic indicators, news, AI agents, early vote, results) lands in one place. They do not change the app in `CODE/`. Open either file directly in a browser. All figures are illustrative mock data.

Both mockups use a real, zoomable map: MapLibre (the map engine the app already uses) on CARTO vector basemaps, which are the same tiles as the app's default. The map needs an internet connection. State and district shapes are embedded in each HTML file, so a single downloaded file works on its own. If the basemap can't load, the race shapes still draw on a plain background. Each map has a **Full screen** button that keeps its layer or race controls and details panel. It uses the browser's native full screen where supported; on iPhone it fills the browser window instead. Press Esc or the button to exit.

| File | Concept | Best for |
|---|---|---|
| `situation-room.html` | **A. Situation Room.** A dense, dark grid of panels in the style of a trading terminal, showing the whole country at once: chamber control prices, generic ballot, FRED indicators, a national map (Senate, House district, money, and early-vote layers; click a state or district for details), biggest movers, a signal-divergence heatmap, cash on hand, a live wire that merges every stream, early vote, tipping-point races, and source health. A live market ticker and stream-status pills run across the top. | Scanning the national picture and spotting what changed |
| `signal-desk.html` | **B. Signal Desk.** A workbench centered on one race. A watchlist sits on the left. The center holds the selected race's KPIs, a race map that zooms to the race's state or district (or shows the whole watchlist), and a linked timeline (market price, polling average, FEC receipts, news volume) that shares one crosshair, with numbered event flags. On the right, an event stream ties each flag to its source. Below is a comparison table for competitive races. It has light and dark themes. | Explaining why a race moved, and comparing races |

Both mockups follow the rules in `PLAN.md`:
- Market prices are labeled as market prices, with their provider and fetch time.
- Missing data has its own visible state ("No public polling"), never a zero.
- AI content carries a badge and a count of its sources.
- Charts use one axis each; series with different units go in separate rows.
