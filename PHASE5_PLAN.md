# Phase 5 — Donor & Lobby Breakdown per Candidate

Goal: every candidate page should let a voter see, at a glance, **how much
money the candidate has accepted from major industry lobbies** (AI, Oil &
Gas, Pro-Israel, Pharma, Defense, Crypto, Labor) — in addition to the
existing top-donor list.

All work happens directly on the `phase5` branch.

## What ships in this phase

### Backend (`/backend`)

1. **Lobby taxonomy** — `src/data/lobbies.ts`
   - Hand-curated list of lobby buckets with three matchers each:
     - `committeeIds` — known FEC committee IDs (kept for future use)
     - `namePatterns` — case-insensitive regex against `Receipt.contributorName`
       (catches PAC contributions where the contributor IS the PAC)
     - `employerPatterns` — case-insensitive regex against
       `Receipt.contributorEmployer` (catches industry-employed individual donors)
   - Seeded with: AI / Big Tech, Oil & Gas, Pro-Israel, Pharma & Health
     Products, Defense & Aerospace, Crypto & Blockchain, Organized Labor.

2. **LobbyService** — `src/services/lobby.service.ts`
   - `getLobbyCatalog()` — returns the static list (id, name, description, color).
   - `getLobbyBreakdown(candidateDbId, cycle)` —
     1. Resolve candidate → committees.
     2. Pre-filter `Receipt` rows in SQL via a single `OR` of `ILIKE`
        substrings (one per pattern), scoped to the cycle date window
        `[cycle-1, cycle]`. This is just a coarse pre-filter so we don't
        scan tens of thousands of receipts in JS.
     3. Run real regex matching in JS to bucket each receipt into a lobby.
     4. Compute per-lobby totals, contribution counts, and top 5
        contributors per lobby.
     5. Compute `totalReceipts` (cycle-windowed aggregate) for context
        and `classifiedPercentage` of receipts that fell into a lobby.

3. **API endpoints** (`src/controllers/candidate.controller.ts`,
   `src/routes/candidates.routes.ts`, `src/routes/index.ts`)
   - `GET /api/candidates/:id/lobby-breakdown?cycle=2026` — full breakdown.
   - `GET /api/lobbies` — static catalog (for legends / future filters).

### Frontend (`/CODE`)

1. **Types & API client**
   - `src/types/candidate.ts` — adds `LobbyContributor`, `LobbyBucket`,
     `LobbyBreakdownResponse`.
   - `src/lib/api.ts` — adds `getCandidateLobbyBreakdown(id, cycle)`.

2. **`LobbyBreakdown` component**
   - `src/components/candidates/LobbyBreakdown.tsx`
   - Card with one row per lobby, sorted by total amount.
   - Each row shows:
     - Color dot, lobby name, short description
     - `$total received` and `% of receipts` on the right
     - A horizontal bar (relative to the largest bucket in the breakdown)
     - Click-to-expand reveals the **top 5 contributors in that lobby**
       with their employer + dollar amount + count of gifts
   - Header summary: `classified $ / % of receipts` for the candidate.
   - Inline disclaimer notes (under-$200 individual gifts not itemized,
     employer self-reporting limitations).
   - Empty / loading / error states all handled.

3. **Wired into the existing candidate profile page**
   - `src/pages/Candidates.tsx` — inside the existing **Campaign Finance**
     tab, slotted between *Top Contributors* and *Spending Breakdown*.
   - Loads lazily (its own `useEffect`) so the rest of the finance tab
     renders immediately.

## Design notes / tradeoffs

- **Coverage is conservative.** The lobby lists are hand-curated — total
  numbers will undercount, never overcount. Easy to extend by editing
  `backend/src/data/lobbies.ts`.
- **No new database columns / migrations.** The aggregation runs against
  the existing `Receipt` table and is computed on demand. If this gets
  slow we can cache results in a `LobbyAggregate` table keyed on
  `(candidateId, cycle)` and refresh on the existing weekly sync.
- **No OpenSecrets dependency.** Their bulk industry codes (CRP IDs)
  would give broader coverage, but require registration and license
  compliance. We can layer them in later behind the same service shape.
- **Cycle filter uses `contributionReceiptDate` window** (`[cycle-1, cycle]`)
  rather than a stored cycle column on the receipt. Existing detailed
  finances code does not filter by cycle at all — the lobby breakdown
  is actually stricter on this dimension.
- **Pro-Israel bucket** is name-pattern only by design (employer-pattern
  matching for it produces too many false positives — e.g. anyone employed
  by an Israeli-headquartered tech firm).

## Future extensions (not in this phase)

- Persist a precomputed `LobbyAggregate` table refreshed by the
  weekly FEC sync job, so the endpoint is O(lobbies) rather than scanning
  receipts on every request.
- Add a **filter on the candidates list page** to find candidates with
  the highest take from a given lobby ("Show me Senate candidates ranked
  by Oil & Gas dollars").
- Pull in OpenSecrets CRP industry codes for finer industry coverage.
- Surface lobby badges on the `CandidateCard` (e.g. "Top recipient of AI
  lobby money in CA").
