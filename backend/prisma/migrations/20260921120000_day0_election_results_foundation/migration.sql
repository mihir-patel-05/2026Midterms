-- Day 0 provider-neutral election results foundation.
-- Additive only: no existing table or column is removed or rewritten.
-- This migration intentionally creates no provider credentials or coverage claims.
-- CreateEnum
CREATE TYPE "ElectionEventType" AS ENUM ('GENERAL', 'PRIMARY', 'RUNOFF', 'SPECIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "ElectionEventStatus" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'POSTPONED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ContestStatus" AS ENUM ('SCHEDULED', 'OPEN', 'UNCONTESTED', 'REPORTING', 'COMPLETE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "BallotStatus" AS ENUM ('UNCONFIRMED', 'FEC_FILED', 'BALLOT_CONFIRMED', 'WITHDRAWN', 'DISQUALIFIED', 'WRITE_IN');

-- CreateEnum
CREATE TYPE "DataSourceType" AS ENUM ('OFFICIAL_FEDERAL', 'OFFICIAL_STATE', 'OFFICIAL_LOCAL', 'LICENSED_PROVIDER', 'MOCK_FIXTURE', 'OTHER');

-- CreateEnum
CREATE TYPE "SourceHealthStatus" AS ENUM ('CURRENT', 'STALE', 'DEGRADED', 'UNAVAILABLE', 'NOT_CONFIGURED');

-- CreateEnum
CREATE TYPE "IngestionRunStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "IngestionErrorSeverity" AS ENUM ('WARNING', 'ERROR', 'FATAL');

-- CreateEnum
CREATE TYPE "RawArtifactStatus" AS ENUM ('FETCHED', 'VALIDATED', 'REJECTED');

-- CreateEnum
CREATE TYPE "GeographyUnitType" AS ENUM ('NATION', 'STATE', 'CONGRESSIONAL_DISTRICT', 'COUNTY', 'PRECINCT', 'SPLIT_PRECINCT', 'MUNICIPALITY', 'OTHER');

-- CreateEnum
CREATE TYPE "GeographyRelationshipType" AS ENUM ('CONTAINS', 'INTERSECTS', 'EQUIVALENT_TO');

-- CreateEnum
CREATE TYPE "ReportingUnitType" AS ENUM ('NATION', 'STATE', 'DISTRICT', 'COUNTY', 'PRECINCT', 'SPLIT_PRECINCT', 'BALLOT_BATCH', 'OTHER');

-- CreateEnum
CREATE TYPE "SnapshotPublicationStatus" AS ENUM ('STAGED', 'PUBLISHED', 'SUPERSEDED', 'REJECTED');

-- CreateEnum
CREATE TYPE "ReportingStatus" AS ENUM ('NOT_STARTED', 'PARTIAL', 'COMPLETE', 'DELAYED', 'SUSPENDED', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "CertificationStatus" AS ENUM ('UNOFFICIAL', 'CANVASSING', 'CERTIFIED', 'RECOUNT', 'CONTESTED');

-- CreateEnum
CREATE TYPE "CertificationEventType" AS ENUM ('UNOFFICIAL_RESULTS_PUBLISHED', 'CANVASS_STARTED', 'AUDIT_STARTED', 'CERTIFIED', 'RECOUNT_STARTED', 'RECOUNT_COMPLETED', 'CONTESTED', 'CORRECTED');

-- CreateTable
CREATE TABLE "data_sources" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DataSourceType" NOT NULL,
    "authority" TEXT,
    "homepage_url" TEXT,
    "attribution_text" TEXT NOT NULL,
    "license_name" TEXT,
    "license_url" TEXT,
    "coverage_description" TEXT,
    "expected_cadence_seconds" INTEGER,
    "health_status" "SourceHealthStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
    "last_checked_at" TIMESTAMP(3),
    "last_successful_at" TIMESTAMP(3),
    "is_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "data_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "election_events" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "election_date" DATE NOT NULL,
    "type" "ElectionEventType" NOT NULL,
    "status" "ElectionEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "cycle" INTEGER NOT NULL,
    "state_code" TEXT,
    "source_id" TEXT,
    "source_election_id" TEXT,
    "source_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "election_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contests" (
    "id" TEXT NOT NULL,
    "election_event_id" TEXT NOT NULL,
    "source_id" TEXT,
    "source_contest_id" TEXT,
    "legacy_election_id" TEXT,
    "election_district_id" TEXT,
    "current_snapshot_id" TEXT,
    "name" TEXT NOT NULL,
    "office" TEXT NOT NULL,
    "office_level" TEXT,
    "state_code" TEXT,
    "district_code" TEXT,
    "status" "ContestStatus" NOT NULL DEFAULT 'SCHEDULED',
    "vote_for" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "people" (
    "id" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "first_name" TEXT,
    "middle_name" TEXT,
    "last_name" TEXT,
    "suffix" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "parties" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "abbreviation" TEXT,
    "source_code" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidacies" (
    "id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "party_id" TEXT,
    "source_id" TEXT,
    "source_candidate_id" TEXT,
    "fec_candidate_id" TEXT,
    "legacy_candidate_id" TEXT,
    "legacy_candidate_election_id" TEXT,
    "ballot_name" TEXT,
    "ballot_order" INTEGER,
    "ballot_status" "BallotStatus" NOT NULL DEFAULT 'UNCONFIRMED',
    "is_incumbent" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidacies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geography_versions" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vintage" TEXT NOT NULL,
    "congress" INTEGER,
    "source_url" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geography_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geography_units" (
    "id" TEXT NOT NULL,
    "version_id" TEXT NOT NULL,
    "type" "GeographyUnitType" NOT NULL,
    "geoid" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state_code" TEXT,
    "district_code" TEXT,
    "county_fips" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geography_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "geography_relations" (
    "parent_id" TEXT NOT NULL,
    "child_id" TEXT NOT NULL,
    "relationship_type" "GeographyRelationshipType" NOT NULL,
    "overlap_percentage" DECIMAL(7,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "geography_relations_pkey" PRIMARY KEY ("parent_id","child_id","relationship_type")
);

-- CreateTable
CREATE TABLE "reporting_units" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "geography_unit_id" TEXT,
    "parent_id" TEXT,
    "source_unit_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ReportingUnitType" NOT NULL,
    "is_districted" BOOLEAN NOT NULL DEFAULT false,
    "is_mail_only" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reporting_units_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_runs" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "status" "IngestionRunStatus" NOT NULL DEFAULT 'QUEUED',
    "parser_version" TEXT NOT NULL,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "records_fetched" INTEGER NOT NULL DEFAULT 0,
    "records_accepted" INTEGER NOT NULL DEFAULT 0,
    "records_rejected" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_artifacts" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "ingestion_run_id" TEXT NOT NULL,
    "status" "RawArtifactStatus" NOT NULL DEFAULT 'FETCHED',
    "storage_key" TEXT NOT NULL,
    "content_sha256" TEXT NOT NULL,
    "content_type" TEXT,
    "payload_byte_size" BIGINT,
    "source_url" TEXT,
    "source_updated_at" TIMESTAMP(3),
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "http_status" INTEGER,
    "etag" TEXT,
    "last_modified" TEXT,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "raw_artifacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ingestion_errors" (
    "id" TEXT NOT NULL,
    "ingestion_run_id" TEXT NOT NULL,
    "raw_artifact_id" TEXT,
    "contest_id" TEXT,
    "severity" "IngestionErrorSeverity" NOT NULL DEFAULT 'ERROR',
    "code" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "record_key" TEXT,
    "details" JSONB,
    "occurred_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ingestion_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "result_snapshots" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "ingestion_run_id" TEXT,
    "raw_artifact_id" TEXT,
    "source_snapshot_id" TEXT,
    "payload_sha256" TEXT NOT NULL,
    "publication_status" "SnapshotPublicationStatus" NOT NULL DEFAULT 'STAGED',
    "reporting_status" "ReportingStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "certification" "CertificationStatus" NOT NULL DEFAULT 'UNOFFICIAL',
    "source_updated_at" TIMESTAMP(3),
    "received_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_at" TIMESTAMP(3),
    "is_partial" BOOLEAN NOT NULL DEFAULT false,
    "is_mock" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "result_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_votes" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "candidacy_id" TEXT NOT NULL,
    "reporting_unit_id" TEXT NOT NULL,
    "vote_type" TEXT NOT NULL DEFAULT 'TOTAL',
    "votes" BIGINT NOT NULL,
    "source_vote_percentage" DECIMAL(7,4),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_votes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contest_metrics" (
    "id" TEXT NOT NULL,
    "snapshot_id" TEXT NOT NULL,
    "reporting_unit_id" TEXT NOT NULL,
    "ballots_cast" BIGINT,
    "votes_counted" BIGINT,
    "registered_voters" BIGINT,
    "reporting_units_total" INTEGER,
    "reporting_units_reporting" INTEGER,
    "precincts_total" INTEGER,
    "precincts_reporting" INTEGER,
    "reporting_percentage" DECIMAL(7,4),
    "is_complete" BOOLEAN,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contest_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certification_events" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "ingestion_run_id" TEXT,
    "type" "CertificationEventType" NOT NULL,
    "certification" "CertificationStatus" NOT NULL,
    "effective_at" TIMESTAMP(3) NOT NULL,
    "source_url" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certification_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "data_sources_key_key" ON "data_sources"("key");

-- CreateIndex
CREATE INDEX "data_sources_type_idx" ON "data_sources"("type");

-- CreateIndex
CREATE INDEX "data_sources_health_status_idx" ON "data_sources"("health_status");

-- CreateIndex
CREATE INDEX "data_sources_is_enabled_is_mock_idx" ON "data_sources"("is_enabled", "is_mock");

-- CreateIndex
CREATE INDEX "election_events_election_date_idx" ON "election_events"("election_date");

-- CreateIndex
CREATE INDEX "election_events_cycle_state_code_idx" ON "election_events"("cycle", "state_code");

-- CreateIndex
CREATE INDEX "election_events_status_idx" ON "election_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "election_events_source_id_source_election_id_key" ON "election_events"("source_id", "source_election_id");

-- CreateIndex
CREATE UNIQUE INDEX "contests_legacy_election_id_key" ON "contests"("legacy_election_id");

-- CreateIndex
CREATE UNIQUE INDEX "contests_current_snapshot_id_key" ON "contests"("current_snapshot_id");

-- CreateIndex
CREATE INDEX "contests_election_event_id_office_district_code_idx" ON "contests"("election_event_id", "office", "district_code");

-- CreateIndex
CREATE INDEX "contests_state_code_office_idx" ON "contests"("state_code", "office");

-- CreateIndex
CREATE INDEX "contests_status_idx" ON "contests"("status");

-- CreateIndex
CREATE UNIQUE INDEX "contests_source_id_source_contest_id_key" ON "contests"("source_id", "source_contest_id");

-- CreateIndex
CREATE INDEX "people_normalized_name_idx" ON "people"("normalized_name");

-- CreateIndex
CREATE INDEX "parties_abbreviation_idx" ON "parties"("abbreviation");

-- CreateIndex
CREATE UNIQUE INDEX "parties_name_source_code_key" ON "parties"("name", "source_code");

-- CreateIndex
CREATE UNIQUE INDEX "candidacies_legacy_candidate_election_id_key" ON "candidacies"("legacy_candidate_election_id");

-- CreateIndex
CREATE INDEX "candidacies_contest_id_ballot_order_idx" ON "candidacies"("contest_id", "ballot_order");

-- CreateIndex
CREATE INDEX "candidacies_fec_candidate_id_idx" ON "candidacies"("fec_candidate_id");

-- CreateIndex
CREATE INDEX "candidacies_legacy_candidate_id_idx" ON "candidacies"("legacy_candidate_id");

-- CreateIndex
CREATE INDEX "candidacies_ballot_status_idx" ON "candidacies"("ballot_status");

-- CreateIndex
CREATE UNIQUE INDEX "candidacies_contest_id_person_id_key" ON "candidacies"("contest_id", "person_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidacies_source_id_source_candidate_id_contest_id_key" ON "candidacies"("source_id", "source_candidate_id", "contest_id");

-- CreateIndex
CREATE UNIQUE INDEX "geography_versions_name_key" ON "geography_versions"("name");

-- CreateIndex
CREATE UNIQUE INDEX "geography_versions_vintage_congress_sha256_key" ON "geography_versions"("vintage", "congress", "sha256");

-- CreateIndex
CREATE INDEX "geography_units_version_id_state_code_type_idx" ON "geography_units"("version_id", "state_code", "type");

-- CreateIndex
CREATE INDEX "geography_units_county_fips_idx" ON "geography_units"("county_fips");

-- CreateIndex
CREATE UNIQUE INDEX "geography_units_version_id_type_geoid_key" ON "geography_units"("version_id", "type", "geoid");

-- CreateIndex
CREATE INDEX "geography_relations_child_id_relationship_type_idx" ON "geography_relations"("child_id", "relationship_type");

-- CreateIndex
CREATE INDEX "reporting_units_geography_unit_id_idx" ON "reporting_units"("geography_unit_id");

-- CreateIndex
CREATE INDEX "reporting_units_parent_id_idx" ON "reporting_units"("parent_id");

-- CreateIndex
CREATE INDEX "reporting_units_type_idx" ON "reporting_units"("type");

-- CreateIndex
CREATE UNIQUE INDEX "reporting_units_source_id_source_unit_id_key" ON "reporting_units"("source_id", "source_unit_id");

-- CreateIndex
CREATE INDEX "ingestion_runs_source_id_started_at_idx" ON "ingestion_runs"("source_id", "started_at");

-- CreateIndex
CREATE INDEX "ingestion_runs_status_created_at_idx" ON "ingestion_runs"("status", "created_at");

-- CreateIndex
CREATE INDEX "raw_artifacts_ingestion_run_id_idx" ON "raw_artifacts"("ingestion_run_id");

-- CreateIndex
CREATE INDEX "raw_artifacts_status_fetched_at_idx" ON "raw_artifacts"("status", "fetched_at");

-- CreateIndex
CREATE UNIQUE INDEX "raw_artifacts_source_id_content_sha256_key" ON "raw_artifacts"("source_id", "content_sha256");

-- CreateIndex
CREATE INDEX "ingestion_errors_ingestion_run_id_severity_idx" ON "ingestion_errors"("ingestion_run_id", "severity");

-- CreateIndex
CREATE INDEX "ingestion_errors_raw_artifact_id_idx" ON "ingestion_errors"("raw_artifact_id");

-- CreateIndex
CREATE INDEX "ingestion_errors_contest_id_idx" ON "ingestion_errors"("contest_id");

-- CreateIndex
CREATE INDEX "result_snapshots_contest_id_published_at_idx" ON "result_snapshots"("contest_id", "published_at");

-- CreateIndex
CREATE INDEX "result_snapshots_source_id_source_updated_at_idx" ON "result_snapshots"("source_id", "source_updated_at");

-- CreateIndex
CREATE INDEX "result_snapshots_publication_status_reporting_status_idx" ON "result_snapshots"("publication_status", "reporting_status");

-- CreateIndex
CREATE UNIQUE INDEX "result_snapshots_contest_id_source_id_payload_sha256_key" ON "result_snapshots"("contest_id", "source_id", "payload_sha256");

-- CreateIndex
CREATE INDEX "candidate_votes_snapshot_id_reporting_unit_id_idx" ON "candidate_votes"("snapshot_id", "reporting_unit_id");

-- CreateIndex
CREATE INDEX "candidate_votes_candidacy_id_snapshot_id_idx" ON "candidate_votes"("candidacy_id", "snapshot_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_votes_snapshot_id_candidacy_id_reporting_unit_id__key" ON "candidate_votes"("snapshot_id", "candidacy_id", "reporting_unit_id", "vote_type");

-- CreateIndex
CREATE INDEX "contest_metrics_reporting_unit_id_idx" ON "contest_metrics"("reporting_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "contest_metrics_snapshot_id_reporting_unit_id_key" ON "contest_metrics"("snapshot_id", "reporting_unit_id");

-- CreateIndex
CREATE INDEX "certification_events_contest_id_effective_at_idx" ON "certification_events"("contest_id", "effective_at");

-- CreateIndex
CREATE INDEX "certification_events_source_id_idx" ON "certification_events"("source_id");

-- AddForeignKey
ALTER TABLE "election_events" ADD CONSTRAINT "election_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_election_event_id_fkey" FOREIGN KEY ("election_event_id") REFERENCES "election_events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_legacy_election_id_fkey" FOREIGN KEY ("legacy_election_id") REFERENCES "elections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_election_district_id_fkey" FOREIGN KEY ("election_district_id") REFERENCES "geography_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contests" ADD CONSTRAINT "contests_current_snapshot_id_fkey" FOREIGN KEY ("current_snapshot_id") REFERENCES "result_snapshots"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_person_id_fkey" FOREIGN KEY ("person_id") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_party_id_fkey" FOREIGN KEY ("party_id") REFERENCES "parties"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_legacy_candidate_id_fkey" FOREIGN KEY ("legacy_candidate_id") REFERENCES "candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidacies" ADD CONSTRAINT "candidacies_legacy_candidate_election_id_fkey" FOREIGN KEY ("legacy_candidate_election_id") REFERENCES "candidate_elections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geography_units" ADD CONSTRAINT "geography_units_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "geography_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geography_relations" ADD CONSTRAINT "geography_relations_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "geography_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "geography_relations" ADD CONSTRAINT "geography_relations_child_id_fkey" FOREIGN KEY ("child_id") REFERENCES "geography_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_units" ADD CONSTRAINT "reporting_units_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_units" ADD CONSTRAINT "reporting_units_geography_unit_id_fkey" FOREIGN KEY ("geography_unit_id") REFERENCES "geography_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reporting_units" ADD CONSTRAINT "reporting_units_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "reporting_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_runs" ADD CONSTRAINT "ingestion_runs_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_artifacts" ADD CONSTRAINT "raw_artifacts_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_artifacts" ADD CONSTRAINT "raw_artifacts_ingestion_run_id_fkey" FOREIGN KEY ("ingestion_run_id") REFERENCES "ingestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_errors" ADD CONSTRAINT "ingestion_errors_ingestion_run_id_fkey" FOREIGN KEY ("ingestion_run_id") REFERENCES "ingestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_errors" ADD CONSTRAINT "ingestion_errors_raw_artifact_id_fkey" FOREIGN KEY ("raw_artifact_id") REFERENCES "raw_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ingestion_errors" ADD CONSTRAINT "ingestion_errors_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_snapshots" ADD CONSTRAINT "result_snapshots_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_snapshots" ADD CONSTRAINT "result_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_snapshots" ADD CONSTRAINT "result_snapshots_ingestion_run_id_fkey" FOREIGN KEY ("ingestion_run_id") REFERENCES "ingestion_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "result_snapshots" ADD CONSTRAINT "result_snapshots_raw_artifact_id_fkey" FOREIGN KEY ("raw_artifact_id") REFERENCES "raw_artifacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_votes" ADD CONSTRAINT "candidate_votes_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "result_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_votes" ADD CONSTRAINT "candidate_votes_candidacy_id_fkey" FOREIGN KEY ("candidacy_id") REFERENCES "candidacies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_votes" ADD CONSTRAINT "candidate_votes_reporting_unit_id_fkey" FOREIGN KEY ("reporting_unit_id") REFERENCES "reporting_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_metrics" ADD CONSTRAINT "contest_metrics_snapshot_id_fkey" FOREIGN KEY ("snapshot_id") REFERENCES "result_snapshots"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contest_metrics" ADD CONSTRAINT "contest_metrics_reporting_unit_id_fkey" FOREIGN KEY ("reporting_unit_id") REFERENCES "reporting_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certification_events" ADD CONSTRAINT "certification_events_ingestion_run_id_fkey" FOREIGN KEY ("ingestion_run_id") REFERENCES "ingestion_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
