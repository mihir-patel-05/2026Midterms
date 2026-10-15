# Intel dashboard mockups

Two standalone design mockups for turning VoteInformed into a single dashboard for researchers, where every data stream (markets, polls, FEC money, outside spending, economic indicators, news, AI agents, early vote, results) lands in one place. They do not change the app in `CODE/`. Open either file directly in a browser. All figures are illustrative mock data.

| File | Concept | Best for |
|---|---|---|
| `situation-room.html` | **A. Situation Room.** A dense, dark grid of panels in the style of a trading terminal, showing the whole country at once: chamber control prices, generic ballot, FRED indicators, a tile map, biggest movers, a signal-divergence heatmap, cash on hand, a live wire that merges every stream, early vote, tipping-point races, and source health. A live market ticker and stream-status pills run across the top. | Scanning the national picture and spotting what changed |
| `signal-desk.html` | **B. Signal Desk.** A workbench centered on one race. A watchlist sits on the left. The center holds the selected race's KPIs and a linked timeline (market price, polling average, FEC receipts, news volume) that shares one crosshair, with numbered event flags. On the right, an event stream ties each flag to its source. Below is a comparison table for competitive races. It has light and dark themes. | Explaining why a race moved, and comparing races |

Both mockups follow the rules in `PLAN.md`:
- Market prices are labeled as market prices, with their provider and fetch time.
- Missing data has its own visible state ("No public polling"), never a zero.
- AI content carries a badge and a count of its sources.
- Charts use one axis each; series with different units go in separate rows.
