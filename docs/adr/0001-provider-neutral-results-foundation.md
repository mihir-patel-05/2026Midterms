# ADR 0001: Provider-neutral election results foundation

- **Status:** Accepted for Day 0; provider selection remains open
- **Date:** 2026-09-21
- **Owners:** Product and engineering
- **Decision deadline:** Before production-shaped ingestion work begins on Day 1

## Context

The beta needs a normalized election-results model, but no nationwide licensed results provider has been selected and no redistribution rights, credentials, service levels, archive rights, or coverage claims have been approved.

Election-night totals are preliminary until the relevant election authority completes its canvass and certification process. The public contract therefore must keep reporting progress separate from certification and must preserve corrected and superseded snapshots.

## Decision

Day 0 uses **mock-only results mode**:

1. All results acquisition is hidden behind provider-neutral parser interfaces.
2. The dashboard and the mock provider each have independent, default-off feature flags.
3. Fixtures use fictional candidates, parties, identifiers, URLs, vote totals, and reporting units. Every fixture and UI surface is visibly labeled `MOCK`.
4. PostgreSQL models store immutable result snapshots, source metadata, ingestion runs, and errors without assuming a provider-specific payload.
5. No live provider is enabled, advertised, or given a coverage claim until legal and product owners approve the source and engineering validates recorded payloads.
6. A provider adapter may emit only the normalized contract. Provider-specific fields remain in raw artifacts or namespaced metadata and do not leak into the public API contract.

## Provider decision checklist

Before enabling a provider flag, record:

- Contract owner and approved service name.
- States, contests, reporting-unit granularity, and election types covered.
- Redistribution, caching, archival, replay, and public-attribution rights.
- Authentication method and rate/usage limits.
- Source timestamp and reporting-progress semantics.
- Unofficial, corrected, recount, and certified status mapping.
- Candidate and contest identifiers and the manual-review policy for ambiguous matches.
- Recorded fixtures for initial totals, partial reporting, corrections, outages, recovery, and certification.
- Expected cadence, stale threshold, support/escalation route, and service-level terms.

## Alternatives considered

### Select a licensed nationwide provider now

Deferred because no vendor, license, credentials, or approved API contract exists. Inventing one would create false implementation and coverage assumptions.

### Build fifty state/local adapters immediately

Deferred for the two-week beta. States can be added only when their official data format, redistribution terms, and replay behavior have been reviewed. Coverage must be published as a matrix rather than inferred.

### Couple the schema to the proof-of-concept payload

Rejected because the prototype is intentionally fictional and omits the operational provenance required for real results.

## Consequences

- Day 0 can complete contracts, schema, UI states, validation, and deployment planning safely.
- Day 1 production-shaped ingestion remains blocked on the provider decision and representative licensed/official fixtures.
- Nationwide live coverage is not a current product claim.
- Mock mode is useful for deterministic tests and rehearsals but must never be confused with live data.

## Authoritative references

- [U.S. Election Assistance Commission: Election Results, Canvass, and Certification](https://www.eac.gov/election-officials/election-results-canvass-and-certification)
- [NIST Election Results Reporting Common Data Format](https://pages.nist.gov/ElectionResultsReporting/)
