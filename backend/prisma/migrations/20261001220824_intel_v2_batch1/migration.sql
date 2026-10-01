-- CreateEnum
CREATE TYPE "MarketProvider" AS ENUM ('KALSHI', 'POLYMARKET');

-- CreateEnum
CREATE TYPE "MarketScope" AS ENUM ('NATIONAL_HOUSE', 'NATIONAL_SENATE', 'STATE_SENATE', 'HOUSE_DISTRICT');

-- CreateEnum
CREATE TYPE "MarketPriceType" AS ENUM ('MIDPOINT', 'LAST_TRADE', 'OUTCOME_PRICE');

-- CreateEnum
CREATE TYPE "IndicatorFrequency" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY');

-- CreateEnum
CREATE TYPE "AgentKind" AS ENUM ('NEWS_TRIAGE', 'DISTRICT_ISSUES', 'WHY_IT_MOVED', 'SIGNAL_DIVERGENCE', 'DAILY_BRIEF', 'CANDIDATE_POSITIONS', 'DATA_QA', 'ASK_THE_RACE', 'ELECTION_NIGHT');

-- CreateTable
CREATE TABLE "market_snapshots" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "provider" "MarketProvider" NOT NULL,
    "scope" "MarketScope" NOT NULL,
    "source_event_id" TEXT NOT NULL,
    "source_market_id" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "contest_id" TEXT,
    "state_code" TEXT,
    "district_code" TEXT,
    "price_type" "MarketPriceType" NOT NULL,
    "price" DECIMAL(5,4) NOT NULL,
    "yes_bid" DECIMAL(5,4),
    "yes_ask" DECIMAL(5,4),
    "volume" DECIMAL(18,2),
    "liquidity" DECIMAL(18,2),
    "source_url" TEXT,
    "captured_hour" TIMESTAMP(3) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "market_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicator_series" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "frequency" "IndicatorFrequency" NOT NULL,
    "description" TEXT,
    "source_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indicator_series_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicator_observations" (
    "id" TEXT NOT NULL,
    "series_id" TEXT NOT NULL,
    "observed_at" DATE NOT NULL,
    "value" DECIMAL(18,6) NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "indicator_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "district_profiles" (
    "id" TEXT NOT NULL,
    "state_code" TEXT NOT NULL,
    "district_code" TEXT NOT NULL,
    "geography_unit_id" TEXT,
    "acs_year" INTEGER NOT NULL,
    "pres_2024_margin" DECIMAL(6,4),
    "partisan_lean" DECIMAL(6,4),
    "population" INTEGER,
    "median_household_income" INTEGER,
    "demographics" JSONB,
    "source_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "district_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_runs" (
    "id" TEXT NOT NULL,
    "agent" "AgentKind" NOT NULL,
    "model" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "schema_version" TEXT NOT NULL,
    "status" "IngestionRunStatus" NOT NULL DEFAULT 'QUEUED',
    "input_sha256" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "raw_output" JSONB,
    "error" TEXT,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_runs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "market_snapshots_contest_id_captured_hour_idx" ON "market_snapshots"("contest_id", "captured_hour");

-- CreateIndex
CREATE INDEX "market_snapshots_scope_state_code_district_code_captured_ho_idx" ON "market_snapshots"("scope", "state_code", "district_code", "captured_hour");

-- CreateIndex
CREATE UNIQUE INDEX "market_snapshots_provider_source_market_id_captured_hour_key" ON "market_snapshots"("provider", "source_market_id", "captured_hour");

-- CreateIndex
CREATE UNIQUE INDEX "indicator_series_key_key" ON "indicator_series"("key");

-- CreateIndex
CREATE INDEX "indicator_series_source_id_idx" ON "indicator_series"("source_id");

-- CreateIndex
CREATE UNIQUE INDEX "indicator_observations_series_id_observed_at_key" ON "indicator_observations"("series_id", "observed_at");

-- CreateIndex
CREATE INDEX "district_profiles_geography_unit_id_idx" ON "district_profiles"("geography_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "district_profiles_state_code_district_code_acs_year_key" ON "district_profiles"("state_code", "district_code", "acs_year");

-- CreateIndex
CREATE INDEX "agent_runs_agent_created_at_idx" ON "agent_runs"("agent", "created_at");

-- CreateIndex
CREATE INDEX "agent_runs_status_created_at_idx" ON "agent_runs"("status", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "agent_runs_agent_prompt_version_input_sha256_key" ON "agent_runs"("agent", "prompt_version", "input_sha256");

-- AddForeignKey
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_series" ADD CONSTRAINT "indicator_series_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "indicator_observations" ADD CONSTRAINT "indicator_observations_series_id_fkey" FOREIGN KEY ("series_id") REFERENCES "indicator_series"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "district_profiles" ADD CONSTRAINT "district_profiles_geography_unit_id_fkey" FOREIGN KEY ("geography_unit_id") REFERENCES "geography_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "district_profiles" ADD CONSTRAINT "district_profiles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Market prices are fractions in [0, 1]. Prisma does not model CHECK constraints.
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_price_range_check" CHECK ("price" >= 0 AND "price" <= 1);
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_yes_bid_range_check" CHECK ("yes_bid" IS NULL OR ("yes_bid" >= 0 AND "yes_bid" <= 1));
ALTER TABLE "market_snapshots" ADD CONSTRAINT "market_snapshots_yes_ask_range_check" CHECK ("yes_ask" IS NULL OR ("yes_ask" >= 0 AND "yes_ask" <= 1));
