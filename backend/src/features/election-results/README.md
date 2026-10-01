# Election results contract

This directory defines the provider-neutral boundary for election results. It does not select,
implement, or make coverage claims about an external provider.

- `contracts.ts` contains strict Zod schemas and inferred TypeScript types for elections,
  contests, candidates, reporting units, candidate and contest results, source status, response
  metadata, and feature flags.
- `parser.ts` defines the adapter boundary that a future approved provider-specific parser must
  implement. Fetching, credentials, raw artifact retention, validation, and publication are
  intentionally separate concerns.
- `fixtures.ts` contains only fictional mock scenarios. The fixtures cover partial Senate results,
  stale House results, certified statewide results, county results, and unavailable data.
- `contracts.test.ts` validates every fixture and the most important cross-field invariants.

Important semantics:

- `status` describes result reporting; `certificationState` separately describes certification.
  Complete reporting is not treated as certification. Certification uses `UNOFFICIAL`,
  `PARTIALLY_CERTIFIED`, and `CERTIFIED`.
- Source health uses `CURRENT` for a source updating within its expected interval; degraded, stale,
  unavailable, and not-configured states remain explicit.
- Progress counts may be `null` when a source does not publish them. Missing progress is not
  represented as zero.
- `freshness`, `coverage`, and `responseStatus` are independent so clients can clearly display
  stale, partial, and unavailable data.
- Mock responses must use `dataMode: "MOCK"`, `isMockData: true`, a `MOCK_FIXTURE` source, and a
  visible disclaimer. The runtime schema rejects inconsistent labeling.
- No winner, forecast, probability, candidate rating, endorsement, or ideological score is part of
  this contract.

## Read path and plugging in a provider

`read-model.ts` serves `/api/v1` results from each contest's published current snapshot
(`Contest.currentSnapshotId`). `RESULTS_READ_SOURCE=database` is the default. Set it to `fixtures`
to serve the in-memory fictional fixtures instead.

A provider plugs in without route changes:

1. Insert a `DataSource` row. Set `homepageUrl` (otherwise the latest raw artifact's `sourceUrl`
   is used, and a source with neither is not served), `attributionText` (used as the disclaimer
   for mock sources) and `expectedCadenceSeconds` (feeds staleness).
2. Ingest into `ResultSnapshot`, `CandidateVote` (`voteType` `TOTAL`) and `ContestMetric`, then call
   `publishSnapshot()` in the same transaction.
3. Make the source eligible. Mock sources (`isMock`, `MOCK_FIXTURE`) need
   `RESULTS_PROVIDER_MOCK_ENABLED=true`. Live sources need `isEnabled` and their `key` in
   `RESULTS_PROVIDER_ENABLED_IDS`.

The contest-level totals come from the metric for the contest's `electionDistrictId`, or else the
snapshot's single top-level reporting unit. Other units become `reportingUnitResults`. Every
response is validated against the contract. A snapshot that fails validation, for example votes
above the counted total or certified results that are not complete, is withheld as
`UNAVAILABLE` and a warning is logged.

Run the focused tests from `backend/`:

```bash
node --import tsx --test src/features/election-results/contracts.test.ts
```

`npm run test:results` runs the whole suite. The database tests are skipped unless
`TEST_DATABASE_URL` points at a disposable, migrated database with
`prisma/fixtures/day0-provider-neutral.mock.sql` applied.
