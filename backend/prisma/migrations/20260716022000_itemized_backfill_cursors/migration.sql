ALTER TABLE "committees"
ADD COLUMN "itemized_sync_cycle" INTEGER,
ADD COLUMN "receipt_sync_cursor" JSONB,
ADD COLUMN "disbursement_sync_cursor" JSONB,
ADD COLUMN "receipt_backfill_complete" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "disbursement_backfill_complete" BOOLEAN NOT NULL DEFAULT false;

-- Previous bounded imports repeatedly requested page numbers from cursor-only
-- endpoints, so none can be considered a complete cycle backfill.
UPDATE "committees"
SET "itemized_last_synced_at" = NULL
WHERE "itemized_last_synced_at" IS NOT NULL;
