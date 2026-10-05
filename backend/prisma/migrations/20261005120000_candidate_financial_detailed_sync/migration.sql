-- Distinguish bulk headline totals from per-candidate source breakdowns.
ALTER TABLE "candidate_financials" ADD COLUMN "detailed_synced_at" TIMESTAMP(3);

-- Rows that already exist were written by the per-candidate sync.
UPDATE "candidate_financials" SET "detailed_synced_at" = "last_updated";
