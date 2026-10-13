-- CreateTable
CREATE TABLE "independent_expenditures" (
    "id" TEXT NOT NULL,
    "sub_id" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "committee_id" TEXT NOT NULL,
    "committee_name" TEXT NOT NULL,
    "candidate_id" TEXT,
    "candidate_name" TEXT,
    "candidate_office" TEXT,
    "candidate_state" TEXT,
    "candidate_district" TEXT,
    "support_oppose" TEXT NOT NULL,
    "amount" DECIMAL(15,2) NOT NULL,
    "expenditure_date" DATE,
    "dissemination_date" DATE,
    "description" TEXT,
    "communication_type" TEXT NOT NULL,
    "payee_name" TEXT,
    "is_notice" BOOLEAN NOT NULL DEFAULT false,
    "is_memo" BOOLEAN NOT NULL DEFAULT false,
    "filing_form" TEXT,
    "transaction_id" TEXT,
    "file_number" INTEGER,
    "pdf_url" TEXT,
    "fetched_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "independent_expenditures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "independent_expenditures_sub_id_key" ON "independent_expenditures"("sub_id");

-- CreateIndex
CREATE INDEX "independent_expenditures_cycle_candidate_id_idx" ON "independent_expenditures"("cycle", "candidate_id");

-- CreateIndex
CREATE INDEX "independent_expenditures_cycle_candidate_state_candidate_of_idx" ON "independent_expenditures"("cycle", "candidate_state", "candidate_office", "candidate_district");

-- CreateIndex
CREATE INDEX "independent_expenditures_cycle_committee_id_idx" ON "independent_expenditures"("cycle", "committee_id");

-- CreateIndex
CREATE INDEX "independent_expenditures_cycle_expenditure_date_idx" ON "independent_expenditures"("cycle", "expenditure_date");
