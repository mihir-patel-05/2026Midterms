# Day 1 implementation report

**Date:** September 23, 2026  
**Mode:** fictional mock data only; no live results source selected or enabled.

## Delivered

- Kept normalized results contract version `1.0.0` across backend and frontend. The API now exposes a fixed `mock-v1` map manifest and the same fictional result envelopes used by the backend contract checks.
- Added feature-flagged `GET /api/v1/bootstrap`, `GET /api/v1/contests/:id/results/current`, and `GET /api/v1/sources/status`. Responses include source, freshness, coverage, mock labeling, limitations, and a stable ETag. Both `FEATURE_ELECTION_DASHBOARD` and `RESULTS_PROVIDER_MOCK_ENABLED` must be true.
- Added a fixture-only ingestion command, `npm run ingest:day0-fixture`, for disposable databases seeded with `prisma/fixtures/day0-provider-neutral.mock.sql`. It hashes and retains raw bytes under `backend/.local/raw-artifacts`, validates identity/vote/progress consistency, records the run and artifact, stages votes and metrics, and publishes the current snapshot in one serializable transaction.
- Added transaction-level checks that the snapshot belongs to the contest and has a validated artifact, votes, and metrics. Failed validation leaves the previous current snapshot in place. Replaying an already published payload returns the existing snapshot and does not move the pointer backward.
- The frontend dashboard now loads normalized mock results from `/api/v1/bootstrap`. The old local result/finance fixture was removed. Its tile map remains a visible placeholder; only fictional `EX` has mock coverage in the API manifest.
- The SQL fixture seed now sets `current_snapshot_id` only when empty, so replaying it after a correction does not restore an older snapshot.

## Verification

- Backend type check and all 12 results checks passed against a disposable PostgreSQL 16 container. These included correction with a vote decrease, replay without duplicate artifacts or snapshots, malformed-result rejection, current-pointer preservation, and cross-contest publication rejection.
- All six migrations applied to an empty disposable database. A second `prisma migrate deploy` reported no pending migrations. The fictional SQL seed inserted rows once and inserted no duplicates on replay.
- The six migration SQL files also applied in order to a second disposable database, exercising the additive Day 0 migration after the legacy schema existed.
- Frontend type check and production build passed. The build retains the existing Browserslist-age and large main-bundle warnings.
- Browser QA at 1440×900 and 390×844 confirmed mock data loading, visible source labels, partial/stale/unavailable previews, mobile layout, and arrow-key focus movement on the map. Browser console had no errors after adding `127.0.0.1` to local development CORS origins.

## Database and source boundaries

The `/api/v1` endpoints are a static mock API stub. They do not yet read the database-published current snapshot. The ingestion command is explicit local rehearsal tooling; it does not schedule work or turn on a provider. The next data vertical slice should build the database read model and replace the static stub only after its source and publication semantics are approved.

The current fixture uses fictional `ZZ` in the database and fictional `EX` in the API/UI. Neither is a coverage claim. The cartogram must remain a placeholder until the Census geography vintage, source checksum, and district/county asset build are selected. No Redis or object-storage service was provisioned; the fixture-only command retains bytes in a local content-addressed directory.

## Reviewed legacy bridge plan

1. Match `Election` to `ElectionEvent` by election date, office context, and jurisdiction, retaining `Contest.legacyElectionId` only after human review of ambiguous races.
2. Match `Candidate` to `Person` and `Candidacy` with FEC ID where available, then reviewed name/contest evidence. Keep `FEC_FILED` separate from `BALLOT_CONFIRMED`; FEC presence alone does not prove ballot listing.
3. Link `CandidateElection` through `Candidacy.legacyCandidateElectionId` after confirming both candidate and contest identities.
4. Run the bridge on a staging copy, report unmatched and conflicting rows, and require a reviewed mapping file before any production backfill. No bridge write is included in Day 1.

## Decisions still needed

- Select a licensed provider or approved official-source subset and record rights, coverage, timestamps, corrections, certification semantics, and representative payloads in ADR 0001. Until then, mock-only mode remains the active decision.
- Choose the Census geography vintage and checksum before replacing the tile cartogram.
- Define the object-storage and queue deployment details before moving raw artifacts or ingestion out of the local fixture rehearsal.
