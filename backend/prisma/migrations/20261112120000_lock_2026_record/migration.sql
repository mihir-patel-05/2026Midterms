-- Lock the 2026 record (#136, docs/plans/lock-2026-record.md). Additive only.
-- CreateEnum
CREATE TYPE "MarketSettlementResult" AS ENUM ('YES', 'NO', 'VOID');

-- AlterTable
ALTER TABLE "result_snapshots" ADD COLUMN     "count_changed_at" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "certification_deadlines" (
    "id" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "state_code" TEXT NOT NULL,
    "deadline" DATE NOT NULL,
    "source_url" TEXT NOT NULL,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "certification_deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranked_choice_rounds" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "candidacy_id" TEXT NOT NULL,
    "round" INTEGER NOT NULL,
    "votes" BIGINT NOT NULL,
    "is_winner" BOOLEAN NOT NULL DEFAULT false,
    "source_url" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranked_choice_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_settlements" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "provider" "MarketProvider" NOT NULL,
    "scope" "MarketScope" NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "source_market_id" TEXT NOT NULL,
    "contest_id" TEXT,
    "state_code" TEXT,
    "district_code" TEXT,
    "outcome" TEXT NOT NULL,
    "result" "MarketSettlementResult" NOT NULL,
    "settlement_value" DECIMAL(5,4),
    "settled_at" TIMESTAMP(3),
    "venue_status" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "certification_deadlines_cycle_state_code_key" ON "certification_deadlines"("cycle", "state_code");

-- CreateIndex
CREATE UNIQUE INDEX "ranked_choice_rounds_contest_id_candidacy_id_key" ON "ranked_choice_rounds"("contest_id", "candidacy_id");

-- CreateIndex
CREATE INDEX "market_settlements_contest_id_idx" ON "market_settlements"("contest_id");

-- CreateIndex
CREATE INDEX "market_settlements_scope_state_code_district_code_idx" ON "market_settlements"("scope", "state_code", "district_code");

-- CreateIndex
CREATE UNIQUE INDEX "market_settlements_provider_source_market_id_key" ON "market_settlements"("provider", "source_market_id");

-- AddForeignKey
ALTER TABLE "ranked_choice_rounds" ADD CONSTRAINT "ranked_choice_rounds_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranked_choice_rounds" ADD CONSTRAINT "ranked_choice_rounds_candidacy_id_fkey" FOREIGN KEY ("candidacy_id") REFERENCES "candidacies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_settlements" ADD CONSTRAINT "market_settlements_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_settlements" ADD CONSTRAINT "market_settlements_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Every existing snapshot was published because its numbers changed (election-night aggregates and tier A
-- detail publish only on a change), so its publish time is when its count last changed.
UPDATE "result_snapshots" SET "count_changed_at" = COALESCE("published_at", "received_at") WHERE "count_changed_at" IS NULL;

ALTER TABLE "market_settlements" ADD CONSTRAINT "market_settlements_value_range" CHECK ("settlement_value" IS NULL OR ("settlement_value" >= 0 AND "settlement_value" <= 1));
ALTER TABLE "ranked_choice_rounds" ADD CONSTRAINT "ranked_choice_rounds_round_positive" CHECK ("round" > 0);
ALTER TABLE "ranked_choice_rounds" ADD CONSTRAINT "ranked_choice_rounds_votes_nonnegative" CHECK ("votes" >= 0);
