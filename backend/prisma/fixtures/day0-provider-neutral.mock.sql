-- FICTIONAL MOCK DATA ONLY.
-- This fixture exercises the provider-neutral schema and does not represent a
-- real jurisdiction, candidate, result provider, election result, or coverage claim.
-- Apply only after migration 20260921120000_day0_election_results_foundation.

BEGIN;

INSERT INTO "data_sources" (
  "id", "key", "name", "type", "attribution_text", "coverage_description",
  "expected_cadence_seconds", "health_status", "is_enabled", "is_mock", "created_at", "updated_at"
) VALUES (
  'mock-source-day0',
  'fictional-day0-fixture',
  'Day 0 Fictional Results Fixture',
  'MOCK_FIXTURE',
  'FICTIONAL MOCK DATA — not official election results',
  'One fictional ZZ district used only for local development and automated tests. No live or nationwide coverage.',
  NULL,
  'CURRENT',
  false,
  true,
  '2026-11-04T02:15:00.000Z',
  '2026-11-04T02:15:00.000Z'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "geography_versions" (
  "id", "name", "vintage", "congress", "source_url", "sha256", "published_at", "created_at", "updated_at"
) VALUES (
  'mock-geography-version-day0',
  'FICTIONAL-MOCK-GEOGRAPHY-V1',
  'MOCK-2026',
  NULL,
  'https://example.invalid/fixtures/day0-provider-neutral.mock.json',
  '150662974f61fd342c05b05332c57f7d141eda721a7cf8d8b3a3650cce84139e',
  '2026-11-04T02:15:00.000Z',
  '2026-11-04T02:15:00.000Z',
  '2026-11-04T02:15:00.000Z'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "geography_units" (
  "id", "version_id", "type", "geoid", "name", "state_code", "district_code", "metadata", "created_at", "updated_at"
) VALUES
  (
    'mock-geo-zz-state', 'mock-geography-version-day0', 'STATE', 'MOCK-ZZ',
    'Fictional Example State', 'ZZ', NULL, '{"isMock":true}'::jsonb,
    '2026-11-04T02:15:00.000Z', '2026-11-04T02:15:00.000Z'
  ),
  (
    'mock-geo-zz-district-00', 'mock-geography-version-day0', 'CONGRESSIONAL_DISTRICT', 'MOCK-ZZ-00',
    'Fictional Example State District 00', 'ZZ', '00', '{"isMock":true}'::jsonb,
    '2026-11-04T02:15:00.000Z', '2026-11-04T02:15:00.000Z'
  )
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "geography_relations" (
  "parent_id", "child_id", "relationship_type", "created_at", "updated_at"
) VALUES (
  'mock-geo-zz-state', 'mock-geo-zz-district-00', 'CONTAINS',
  '2026-11-04T02:15:00.000Z', '2026-11-04T02:15:00.000Z'
) ON CONFLICT ("parent_id", "child_id", "relationship_type") DO NOTHING;

INSERT INTO "reporting_units" (
  "id", "source_id", "geography_unit_id", "source_unit_id", "name", "type",
  "is_districted", "is_mail_only", "created_at", "updated_at"
) VALUES (
  'mock-reporting-unit-zz-district-00',
  'mock-source-day0',
  'mock-geo-zz-district-00',
  'MOCK-ZZ-CD-00',
  'Fictional Example State District 00',
  'DISTRICT',
  true,
  false,
  '2026-11-04T02:15:00.000Z',
  '2026-11-04T02:15:00.000Z'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "election_events" (
  "id", "name", "election_date", "type", "status", "cycle", "state_code",
  "source_id", "source_election_id", "source_url", "created_at", "updated_at"
) VALUES (
  'mock-election-event-2026-zz',
  'Fictional Example State 2026 General Election',
  '2026-11-03',
  'GENERAL',
  'COMPLETED',
  2026,
  'ZZ',
  'mock-source-day0',
  'MOCK-2026-GENERAL-ZZ',
  'https://example.invalid/2026/results/zz',
  '2026-11-04T02:15:00.000Z',
  '2026-11-04T02:15:00.000Z'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "contests" (
  "id", "election_event_id", "source_id", "source_contest_id", "election_district_id",
  "name", "office", "office_level", "state_code", "district_code", "status", "vote_for",
  "created_at", "updated_at"
) VALUES (
  'mock-contest-zz-house-00',
  'mock-election-event-2026-zz',
  'mock-source-day0',
  'MOCK-ZZ-HOUSE-00',
  'mock-geo-zz-district-00',
  'Fictional Example State U.S. House District 00',
  'US_HOUSE',
  'FEDERAL',
  'ZZ',
  '00',
  'REPORTING',
  1,
  '2026-11-04T02:15:00.000Z',
  '2026-11-04T02:15:00.000Z'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "parties" (
  "id", "name", "abbreviation", "source_code", "created_at", "updated_at"
) VALUES
  ('mock-party-a', 'Example Party A', 'EPA', 'MOCK-A', '2026-11-04T02:15:00.000Z', '2026-11-04T02:15:00.000Z'),
  ('mock-party-b', 'Example Party B', 'EPB', 'MOCK-B', '2026-11-04T02:15:00.000Z', '2026-11-04T02:15:00.000Z')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "people" (
  "id", "display_name", "normalized_name", "first_name", "last_name", "created_at", "updated_at"
) VALUES
  ('mock-person-alex-example', 'Alex Example', 'alex example', 'Alex', 'Example', '2026-11-04T02:15:00.000Z', '2026-11-04T02:15:00.000Z'),
  ('mock-person-bailey-sample', 'Bailey Sample', 'bailey sample', 'Bailey', 'Sample', '2026-11-04T02:15:00.000Z', '2026-11-04T02:15:00.000Z')
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "candidacies" (
  "id", "person_id", "contest_id", "party_id", "source_id", "source_candidate_id",
  "ballot_name", "ballot_order", "ballot_status", "is_incumbent", "created_at", "updated_at"
) VALUES
  (
    'mock-candidacy-alex-example', 'mock-person-alex-example', 'mock-contest-zz-house-00',
    'mock-party-a', 'mock-source-day0', 'MOCK-CANDIDATE-A', 'Alex Example', 1,
    'BALLOT_CONFIRMED', false, '2026-11-04T02:15:00.000Z', '2026-11-04T02:15:00.000Z'
  ),
  (
    'mock-candidacy-bailey-sample', 'mock-person-bailey-sample', 'mock-contest-zz-house-00',
    'mock-party-b', 'mock-source-day0', 'MOCK-CANDIDATE-B', 'Bailey Sample', 2,
    'BALLOT_CONFIRMED', false, '2026-11-04T02:15:00.000Z', '2026-11-04T02:15:00.000Z'
  )
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "ingestion_runs" (
  "id", "source_id", "status", "parser_version", "started_at", "completed_at",
  "records_fetched", "records_accepted", "records_rejected", "metadata", "created_at", "updated_at"
) VALUES (
  'mock-ingestion-run-day0',
  'mock-source-day0',
  'SUCCEEDED',
  'fixture-parser/1.0.0',
  '2026-11-04T02:15:01.000Z',
  '2026-11-04T02:15:02.000Z',
  1,
  1,
  0,
  '{"isMock":true,"fixture":"day0-provider-neutral.mock.json"}'::jsonb,
  '2026-11-04T02:15:01.000Z',
  '2026-11-04T02:15:02.000Z'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "raw_artifacts" (
  "id", "source_id", "ingestion_run_id", "status", "storage_key", "content_sha256",
  "content_type", "payload_byte_size", "source_url", "source_updated_at", "fetched_at",
  "http_status", "is_mock", "metadata", "created_at", "updated_at"
) VALUES (
  'mock-raw-artifact-day0',
  'mock-source-day0',
  'mock-ingestion-run-day0',
  'VALIDATED',
  'prisma/fixtures/day0-provider-neutral.mock.json',
  '150662974f61fd342c05b05332c57f7d141eda721a7cf8d8b3a3650cce84139e',
  'application/json',
  2033,
  'https://example.invalid/2026/results/zz/house-00',
  '2026-11-04T02:15:00.000Z',
  '2026-11-04T02:15:01.000Z',
  NULL,
  true,
  '{"fixtureNotice":"FICTIONAL MOCK DATA ONLY"}'::jsonb,
  '2026-11-04T02:15:01.000Z',
  '2026-11-04T02:15:02.000Z'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "result_snapshots" (
  "id", "contest_id", "source_id", "ingestion_run_id", "raw_artifact_id", "source_snapshot_id",
  "payload_sha256", "publication_status", "reporting_status", "certification", "source_updated_at",
  "received_at", "published_at", "is_partial", "is_mock", "notes", "created_at", "updated_at"
) VALUES (
  'mock-result-snapshot-day0',
  'mock-contest-zz-house-00',
  'mock-source-day0',
  'mock-ingestion-run-day0',
  'mock-raw-artifact-day0',
  'MOCK-SNAPSHOT-001',
  '150662974f61fd342c05b05332c57f7d141eda721a7cf8d8b3a3650cce84139e',
  'PUBLISHED',
  'PARTIAL',
  'UNOFFICIAL',
  '2026-11-04T02:15:00.000Z',
  '2026-11-04T02:15:01.000Z',
  '2026-11-04T02:15:02.000Z',
  true,
  true,
  'FICTIONAL MOCK DATA ONLY. Not official results.',
  '2026-11-04T02:15:01.000Z',
  '2026-11-04T02:15:02.000Z'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "candidate_votes" (
  "id", "snapshot_id", "candidacy_id", "reporting_unit_id", "vote_type", "votes",
  "source_vote_percentage", "created_at", "updated_at"
) VALUES
  (
    'mock-vote-alex-example', 'mock-result-snapshot-day0', 'mock-candidacy-alex-example',
    'mock-reporting-unit-zz-district-00', 'TOTAL', 12345, 51.3402,
    '2026-11-04T02:15:02.000Z', '2026-11-04T02:15:02.000Z'
  ),
  (
    'mock-vote-bailey-sample', 'mock-result-snapshot-day0', 'mock-candidacy-bailey-sample',
    'mock-reporting-unit-zz-district-00', 'TOTAL', 11700, 48.6598,
    '2026-11-04T02:15:02.000Z', '2026-11-04T02:15:02.000Z'
  )
ON CONFLICT ("id") DO NOTHING;

INSERT INTO "contest_metrics" (
  "id", "snapshot_id", "reporting_unit_id", "votes_counted", "reporting_units_total",
  "reporting_units_reporting", "precincts_total", "precincts_reporting", "reporting_percentage",
  "is_complete", "created_at", "updated_at"
) VALUES (
  'mock-contest-metric-day0',
  'mock-result-snapshot-day0',
  'mock-reporting-unit-zz-district-00',
  24045,
  100,
  73,
  100,
  73,
  73.0000,
  false,
  '2026-11-04T02:15:02.000Z',
  '2026-11-04T02:15:02.000Z'
) ON CONFLICT ("id") DO NOTHING;

INSERT INTO "certification_events" (
  "id", "contest_id", "source_id", "ingestion_run_id", "type", "certification",
  "effective_at", "source_url", "notes", "created_at", "updated_at"
) VALUES (
  'mock-certification-event-day0',
  'mock-contest-zz-house-00',
  'mock-source-day0',
  'mock-ingestion-run-day0',
  'UNOFFICIAL_RESULTS_PUBLISHED',
  'UNOFFICIAL',
  '2026-11-04T02:15:00.000Z',
  'https://example.invalid/2026/results/zz/house-00',
  'FICTIONAL MOCK DATA ONLY. This event does not certify any real result.',
  '2026-11-04T02:15:02.000Z',
  '2026-11-04T02:15:02.000Z'
) ON CONFLICT ("id") DO NOTHING;

UPDATE "contests"
SET "current_snapshot_id" = 'mock-result-snapshot-day0',
    "updated_at" = '2026-11-04T02:15:02.000Z'
WHERE "id" = 'mock-contest-zz-house-00'
  AND "current_snapshot_id" IS NULL;

COMMIT;
