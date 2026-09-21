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

Run the focused tests from `backend/`:

```bash
node --import tsx --test src/features/election-results/contracts.test.ts
```
