-- CreateEnum
CREATE TYPE "NewsTopic" AS ENUM ('CAMPAIGN', 'POLLS', 'CONGRESS', 'WHITE_HOUSE', 'COURTS', 'MONEY', 'VOTING', 'RESULTS', 'POLICY', 'OTHER');

-- CreateEnum
CREATE TYPE "NewsSelectionMethod" AS ENUM ('AI', 'RANKED');

-- AlterEnum
ALTER TYPE "AgentKind" ADD VALUE 'TOP_STORIES';

-- CreateTable
CREATE TABLE "news_stories" (
    "id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "headline" TEXT NOT NULL,
    "snippet" TEXT,
    "outlet" TEXT NOT NULL,
    "outlet_domain" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL,
    "topic" "NewsTopic" NOT NULL,
    "state_code" TEXT,
    "outlet_count" INTEGER NOT NULL,
    "also_covered_by" JSONB NOT NULL DEFAULT '[]',
    "selected_by" "NewsSelectionMethod" NOT NULL,
    "ingestion_run_id" TEXT NOT NULL,
    "agent_run_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_stories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "news_stories_rank_idx" ON "news_stories"("rank");

-- CreateIndex
CREATE INDEX "news_stories_published_at_idx" ON "news_stories"("published_at");

-- CreateIndex
CREATE INDEX "news_stories_ingestion_run_id_idx" ON "news_stories"("ingestion_run_id");

-- AddForeignKey
ALTER TABLE "news_stories" ADD CONSTRAINT "news_stories_ingestion_run_id_fkey" FOREIGN KEY ("ingestion_run_id") REFERENCES "ingestion_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_stories" ADD CONSTRAINT "news_stories_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

