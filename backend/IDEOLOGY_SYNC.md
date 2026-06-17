# Ideology Scoring Sync (issue #33)

Populates the `IdeologyScore` table with **GovTrack-based ideology and
leadership scores** for sitting members of Congress, which powers the
"Ideology Score" spectrum on candidate profiles (PRD §3.4).

Before this sync existed, the `IdeologyScore` table was never written to, so the
ideology UI was dead code for every candidate. Running this brings it to life.

## What it does

```
FEC candidate IDs (our DB)
        │
        │  unitedstates/congress-legislators crosswalk
        ▼
GovTrack person IDs
        │
        │  GovTrack sponsorship-analysis (House + Senate)
        ▼
ideology + leadership scores  ──►  upsert into IdeologyScore
```

1. **Crosswalk** — fetches `legislators-current.yaml` and builds a map of
   FEC candidate ID → GovTrack person ID. Only *current* members appear here,
   which is exactly the set that has a voting record to score.
2. **Scores** — fetches GovTrack's per-Congress `sponsorshipanalysis_h.txt` and
   `sponsorshipanalysis_s.txt`, which contain an ideology score (0 = most
   liberal/left, 1 = most conservative/right) and a leadership score per member.
3. **Join + upsert** — for each candidate whose FEC ID resolves to a GovTrack
   member with a score, upserts one `IdeologyScore` row keyed on
   `(candidateId, congressSession)`.

Implementation: [`src/services/ideology.service.ts`](src/services/ideology.service.ts),
runnable via [`src/scripts/sync-ideology.ts`](src/scripts/sync-ideology.ts).

## Running it

```bash
# Uses IDEOLOGY_CONGRESS from env (default 119)
npm run sync:ideology

# Or pin a specific Congress
npm run sync:ideology -- --congress 119
```

Requires:
- A reachable `DATABASE_URL`.
- **Network egress** to `www.govtrack.us` and `raw.githubusercontent.com`
  (hosts configurable via `IDEOLOGY_GOVTRACK_BASE_URL` / `IDEOLOGY_LEGISLATORS_URL`).
  In locked-down/allowlisted environments these two hosts must be permitted.

The script exits non-zero if **zero** scores were written, so a cron/CI run will
surface a broken upstream source or an empty database.

## Scheduling

Ideology data changes slowly; the PRD calls for monthly refreshes. Run it on a
monthly cron (e.g. a Railway scheduled job) with the same env as the app:

```
npm run sync:ideology
```

It is safe to re-run — upserts are idempotent per `(candidateId, congressSession)`.

## Scale & storage notes

- GovTrack's raw ideology is `0..1`. We store it **scaled to `0..100`**
  (0 = progressive/left, 100 = conservative/right) so the existing frontend
  spectrum renders without per-component conversion.
- `leadershipScore` is stored as GovTrack reports it (not a percentage).
- `billsSponsored` / `billsCosponsored` are **not** populated yet — GovTrack's
  sponsorship-analysis file doesn't include raw counts. The columns default to
  `0` and the UI hides them until a source is wired in (see below). This is the
  remaining gap vs. the full issue #33 "scorecard".

## Extending (future)

- **Bill counts & key votes**: pull from the Congress.gov API (the supported
  successor to the ProPublica Congress API) keyed by bioguide ID, which the same
  crosswalk already provides.
- **Voting participation rate**: also available from Congress.gov member data.
- **Comparisons** (party / state-delegation averages, PRD §3.4.2): compute from
  the populated `IdeologyScore` rows.
