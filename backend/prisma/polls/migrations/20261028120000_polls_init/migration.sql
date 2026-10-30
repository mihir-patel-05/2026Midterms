-- CreateEnum
CREATE TYPE "PollStatus" AS ENUM ('PUBLISHED', 'NEEDS_REVIEW', 'REJECTED');

-- CreateEnum
CREATE TYPE "PollOffice" AS ENUM ('SENATE', 'HOUSE');

-- CreateEnum
CREATE TYPE "PollPopulation" AS ENUM ('LV', 'RV', 'A', 'V', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "PollSyncStatus" AS ENUM ('RUNNING', 'SUCCEEDED', 'PARTIAL', 'FAILED');

-- CreateTable
CREATE TABLE "polls" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "race_code" TEXT,
    "office" "PollOffice",
    "state" CHAR(2),
    "district" CHAR(2),
    "poll_type" TEXT NOT NULL,
    "subject" TEXT,
    "pollster" TEXT NOT NULL,
    "sponsors" TEXT[],
    "start_date" DATE,
    "end_date" DATE NOT NULL,
    "sample_size" INTEGER,
    "population" "PollPopulation" NOT NULL,
    "is_internal" BOOLEAN NOT NULL DEFAULT false,
    "url" TEXT,
    "status" "PollStatus" NOT NULL,
    "review_reason" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "raw" JSONB NOT NULL,
    "content_hash" TEXT NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "last_sync_run_id" TEXT,

    CONSTRAINT "polls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_answers" (
    "id" TEXT NOT NULL,
    "poll_id" TEXT NOT NULL,
    "choice" TEXT NOT NULL,
    "pct" DECIMAL(5,2) NOT NULL,
    "party" TEXT,
    "candidate_fec_id" TEXT,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "poll_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_sync_runs" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" "PollSyncStatus" NOT NULL DEFAULT 'RUNNING',
    "parser_version" TEXT NOT NULL,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "request_count" INTEGER NOT NULL DEFAULT 0,
    "fetched" INTEGER NOT NULL DEFAULT 0,
    "inserted" INTEGER NOT NULL DEFAULT 0,
    "updated" INTEGER NOT NULL DEFAULT 0,
    "unchanged" INTEGER NOT NULL DEFAULT 0,
    "needs_review" INTEGER NOT NULL DEFAULT 0,
    "skipped" INTEGER NOT NULL DEFAULT 0,
    "error_summary" TEXT,
    "metadata" JSONB,

    CONSTRAINT "poll_sync_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "poll_sync_leases" (
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "poll_sync_leases_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE INDEX "polls_race_code_status_end_date_idx" ON "polls"("race_code", "status", "end_date" DESC);

-- CreateIndex
CREATE INDEX "polls_status_last_seen_at_idx" ON "polls"("status", "last_seen_at");

-- CreateIndex
CREATE UNIQUE INDEX "polls_source_external_id_key" ON "polls"("source", "external_id");

-- CreateIndex
CREATE INDEX "poll_answers_candidate_fec_id_idx" ON "poll_answers"("candidate_fec_id");

-- CreateIndex
CREATE UNIQUE INDEX "poll_answers_poll_id_choice_key" ON "poll_answers"("poll_id", "choice");

-- CreateIndex
CREATE INDEX "poll_sync_runs_source_started_at_idx" ON "poll_sync_runs"("source", "started_at" DESC);

-- AddForeignKey
ALTER TABLE "polls" ADD CONSTRAINT "polls_last_sync_run_id_fkey" FOREIGN KEY ("last_sync_run_id") REFERENCES "poll_sync_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "poll_answers" ADD CONSTRAINT "poll_answers_poll_id_fkey" FOREIGN KEY ("poll_id") REFERENCES "polls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
