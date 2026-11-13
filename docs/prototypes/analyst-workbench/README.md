# Mycroft analyst workbench mockups

Five screens for an analyst-facing version of the product, in light and dark themes. The War Room is an operations dashboard for watching things happen. This design is for working with the numbers afterward: comparing, checking sources, and writing up findings. These files do not change the app in `CODE/`. All figures are illustrative mock data, and candidates are shown by party and role, not by name.

Open any `.html` file in a browser. The left menu links the screens, and the **Dark mode** button switches themes. These are static exports: the data controls (scatter selection, filters, toggles) show one state only. The interactive version lives on the design canvas, which is private until shared: [Mycroft Analyst Workbench](https://claude.ai/artifact/Gfu69UT6JYUK8DnxkyzunC).

| Screen | File | What it shows | Light | Dark |
|---|---|---|---|---|
| Desk | `desk.html` | House and Senate seat counts with uncalled seats hatched, certification progress, uncalled races with the estimated outstanding vote and its lean, a "since your last visit" feed (calls, count updates, corrections, market moves), the biggest swings, and saved notebooks | [png](screenshots/desk-light.png) | [png](screenshots/desk-dark.png) |
| Race file | `race-file.html` | One race (AZ-06): the count, a "what's still out" estimate labeled as never a call, one signal timeline (market price, polling average with error band, rating changes, lettered events with sources), county swing, money, notes, and sources | [png](screenshots/race-file-light.png) | [png](screenshots/race-file-dark.png) |
| Swing explorer | `swing-explorer.html` | 2024 presidential margin against 2026 House margin for 30 contested seats, with no-swing and median-swing lines, a linked table, a detail card, and a swing histogram | [png](screenshots/swing-explorer-light.png) | [png](screenshots/swing-explorer-dark.png) |
| Signal scorecard | `signal-scorecard.html` | Brier scores for markets, ratings, polls and fundamentals, on the common set of races or on every race a signal covered; calibration; accuracy by weeks before Election Day; biggest misses | [png](screenshots/signal-scorecard-light.png) | [png](screenshots/signal-scorecard-dark.png) |
| Notebook | `notebook.html` | A memo editor: live charts that can be frozen "as of" a date, typed numbers flagged when the data changes, a labeled AI suggestion with sources, a live table, data checks, comments, and publish options | [png](screenshots/notebook-light.png) | [png](screenshots/notebook-dark.png) |

## Design system

- **Tokens:** [`tokens.css`](tokens.css) holds every color for both themes, plus the type stacks. The mockups use only these variables, so the app can copy the file as is.
- **Type:** IBM Plex Sans for UI. IBM Plex Mono for every number (margins, prices, vote counts, times) so columns line up. IBM Plex Serif only for notebook body text.
- **Color:** one indigo accent for selection, links and analyst actions. Blue and red are for party marks and numbers only, never for UI chrome. Margins use the `D+3.2` / `R+1.2` / `Even` format, colored by party.
- **States that must stay visible** (from `PLAN.md` section 1):
  - Uncalled or not-yet-counted vote: a hatched fill or a dashed outline.
  - Missing data: its own chip ("No public polling", "No estimate"), never a zero.
  - Estimates: labeled as estimates, never as calls.
  - Market prices: labeled as market prices, never as forecasts.
  - AI text: an "AI summary" or "Suggested by AI" label with a source count.
  - Corrections: shown with the old value, kept in history.
- **Provenance everywhere:** each figure shows its source and fetch time. Pages have an "as of" control, and most panels offer export CSV, cite, and add to notebook.

## Mapping to the backlog

| Screen | Related work |
|---|---|
| Desk | #191 post-election mode, #168 alerts, P05 "Since your last visit", P11 corrections |
| Race file | #177 "what's still out" model, #166 why it moved, #152 race memos |
| Swing explorer | #140 swing explorer |
| Signal scorecard | #141 signal scorecard, #175 the referee |
| Notebook | #151 accounts and saved workspaces, #179 "as of" time travel and embeds, #198 share links |

## Files

- `*.html`: standalone static exports of each screen, generated from the sources below.
- `screenshots/`: full-page PNGs of each screen in both themes, at 2x.
- `source/*.dc.html`: the screens as they are written on the design canvas. They use the canvas's template format (`{{holes}}`, `<sc-for>`, `<sc-if>`, and a `renderVals()` class), so they don't open on their own. They are the reference for exact markup, spacing and interaction state.
- `tools/export.js`: regenerates the `.html` exports and screenshots from `source/`. From this folder, run `node tools/export.js source .`. It needs Playwright with Chromium.
