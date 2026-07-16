-- AlterTable
ALTER TABLE "committees" ADD COLUMN     "itemized_last_synced_at" TIMESTAMP(3),
ADD COLUMN     "itemized_sync_error" TEXT;

-- AlterTable
ALTER TABLE "elections" ALTER COLUMN "election_date" SET DATA TYPE DATE;

-- AlterTable
ALTER TABLE "candidate_elections" ADD COLUMN     "ballot_status" TEXT NOT NULL DEFAULT 'UNCONFIRMED';

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "contributor_committee_id" TEXT,
ADD COLUMN     "source_id" TEXT;

-- AlterTable
ALTER TABLE "disbursements" ADD COLUMN     "source_id" TEXT;

-- Remove exact legacy duplicates before the new source-id based importer takes
-- ownership. Remaining legacy rows are replaced committee-by-committee on the
-- first bounded itemized refresh.
WITH ranked_receipts AS (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "committee_id", "contributor_name", "contributor_state",
          "contributor_city", "contributor_employer", "contributor_occupation",
          "contribution_receipt_amount", "contribution_receipt_date",
          "receipt_type", "image_number"
        ORDER BY "created_at", "id"
    ) AS row_number
    FROM "receipts"
)
DELETE FROM "receipts"
WHERE "id" IN (SELECT "id" FROM ranked_receipts WHERE row_number > 1);

WITH ranked_disbursements AS (
    SELECT "id", ROW_NUMBER() OVER (
        PARTITION BY "committee_id", "recipient_name", "disbursement_type",
          "disbursement_amount", "disbursement_date",
          "disbursement_description", "image_number"
        ORDER BY "created_at", "id"
    ) AS row_number
    FROM "disbursements"
)
DELETE FROM "disbursements"
WHERE "id" IN (SELECT "id" FROM ranked_disbursements WHERE row_number > 1);

-- AlterTable
ALTER TABLE "deadlines" ALTER COLUMN "date" SET DATA TYPE DATE;

-- CreateTable
CREATE TABLE "sync_leases" (
    "name" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_leases_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "admin_sessions" (
    "id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "admin_user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "last_used_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sync_leases_expires_at_idx" ON "sync_leases"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_sessions_token_hash_key" ON "admin_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "admin_sessions_admin_user_id_idx" ON "admin_sessions"("admin_user_id");

-- CreateIndex
CREATE INDEX "admin_sessions_expires_at_idx" ON "admin_sessions"("expires_at");

-- CreateIndex
CREATE UNIQUE INDEX "receipts_source_id_key" ON "receipts"("source_id");

-- CreateIndex
CREATE INDEX "receipts_contributor_committee_id_idx" ON "receipts"("contributor_committee_id");

-- CreateIndex
CREATE UNIQUE INDEX "disbursements_source_id_key" ON "disbursements"("source_id");

-- AddForeignKey
ALTER TABLE "admin_sessions" ADD CONSTRAINT "admin_sessions_admin_user_id_fkey" FOREIGN KEY ("admin_user_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
