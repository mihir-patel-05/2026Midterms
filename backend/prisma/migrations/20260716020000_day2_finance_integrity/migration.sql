-- Preserve the OpenFEC fields needed to scope transactions to a cycle,
-- inspect amendment chains, and exclude memo rows that do not count toward
-- committee totals. Legacy rows remain nullable until their committee is
-- refreshed by the source-id importer.

ALTER TABLE "receipts"
ADD COLUMN "transaction_id" TEXT,
ADD COLUMN "file_number" INTEGER,
ADD COLUMN "amendment_indicator" TEXT,
ADD COLUMN "cycle" INTEGER,
ADD COLUMN "memoed_subtotal" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "disbursements"
ADD COLUMN "transaction_id" TEXT,
ADD COLUMN "file_number" INTEGER,
ADD COLUMN "amendment_indicator" TEXT,
ADD COLUMN "cycle" INTEGER,
ADD COLUMN "memoed_subtotal" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "receipts_committee_id_cycle_idx" ON "receipts"("committee_id", "cycle");
CREATE INDEX "receipts_committee_id_transaction_id_idx" ON "receipts"("committee_id", "transaction_id");
CREATE INDEX "disbursements_committee_id_cycle_idx" ON "disbursements"("committee_id", "cycle");
CREATE INDEX "disbursements_committee_id_transaction_id_idx" ON "disbursements"("committee_id", "transaction_id");
