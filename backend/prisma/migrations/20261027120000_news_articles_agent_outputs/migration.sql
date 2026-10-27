-- CreateEnum
CREATE TYPE "AgentOutputScope" AS ENUM ('NATIONAL', 'STATE', 'RACE');

-- CreateEnum
CREATE TYPE "AgentOutputStatus" AS ENUM ('PUBLISHED', 'PENDING_REVIEW', 'REJECTED', 'SUPERSEDED');

-- AlterEnum
ALTER TYPE "AgentKind" ADD VALUE 'TOP_STORIES';

-- CreateTable
CREATE TABLE "articles" (
    "id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "ingestion_run_id" TEXT NOT NULL,
    "external_id" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonical_url" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "snippet" TEXT,
    "outlet" TEXT NOT NULL,
    "outlet_key" TEXT NOT NULL,
    "outlet_domain" TEXT,
    "published_at" TIMESTAMP(3) NOT NULL,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "last_seen_at" TIMESTAMP(3) NOT NULL,
    "found_by" TEXT[],
    "feed_position" INTEGER,
    "feed_position_at" TIMESTAMP(3),
    "related" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "articles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_outputs" (
    "id" TEXT NOT NULL,
    "agent" "AgentKind" NOT NULL,
    "scope_type" "AgentOutputScope" NOT NULL,
    "scope_key" TEXT NOT NULL,
    "status" "AgentOutputStatus" NOT NULL,
    "payload" JSONB NOT NULL,
    "agent_run_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_outputs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_output_citations" (
    "id" TEXT NOT NULL,
    "output_id" TEXT NOT NULL,
    "article_id" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_output_citations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "articles_last_seen_at_idx" ON "articles"("last_seen_at");

-- CreateIndex
CREATE INDEX "articles_published_at_idx" ON "articles"("published_at");

-- CreateIndex
CREATE UNIQUE INDEX "articles_source_id_external_id_key" ON "articles"("source_id", "external_id");

-- CreateIndex
CREATE INDEX "agent_outputs_agent_scope_type_scope_key_status_created_at_idx" ON "agent_outputs"("agent", "scope_type", "scope_key", "status", "created_at");

-- CreateIndex
CREATE INDEX "agent_output_citations_article_id_idx" ON "agent_output_citations"("article_id");

-- CreateIndex
CREATE UNIQUE INDEX "agent_output_citations_output_id_article_id_key" ON "agent_output_citations"("output_id", "article_id");

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "articles" ADD CONSTRAINT "articles_ingestion_run_id_fkey" FOREIGN KEY ("ingestion_run_id") REFERENCES "ingestion_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_outputs" ADD CONSTRAINT "agent_outputs_agent_run_id_fkey" FOREIGN KEY ("agent_run_id") REFERENCES "agent_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_output_citations" ADD CONSTRAINT "agent_output_citations_output_id_fkey" FOREIGN KEY ("output_id") REFERENCES "agent_outputs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_output_citations" ADD CONSTRAINT "agent_output_citations_article_id_fkey" FOREIGN KEY ("article_id") REFERENCES "articles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

