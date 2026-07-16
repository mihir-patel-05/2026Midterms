-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "candidates" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "party" TEXT,
    "office" TEXT NOT NULL,
    "district" TEXT,
    "state" TEXT NOT NULL,
    "incumbent_status" TEXT,
    "active_through" INTEGER,
    "cycles" INTEGER[],
    "election_years" INTEGER[],
    "candidate_status" TEXT,
    "biography" TEXT,
    "current_office_held" TEXT,
    "campaign_website" TEXT,
    "social_media" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_financials" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "candidate_election_year" INTEGER,
    "receipts" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "individual_contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "individual_itemized_contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "individual_unitemized_contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "pac_contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "party_contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "candidate_contribution" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "other_receipts" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "transfers_from_affiliated_committee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "loans_received" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "loans_received_from_candidate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "other_loans_received" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "federal_funds" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "disbursements" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "operating_expenditures" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "transfers_to_other_authorized_committee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "fundraising_disbursements" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "exempt_legal_accounting_disbursement" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "loan_repayments_made" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "repayments_loans_made_by_candidate" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "repayments_other_loans" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "other_disbursements" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "contribution_refunds" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "refunded_individual_contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "refunded_other_political_committee_contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "refunded_political_party_committee_contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "offsets_to_operating_expenditures" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_offsets_to_operating_expenditures" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "offsets_to_fundraising_expenditures" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "offsets_to_legal_accounting" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_contributions" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "net_operating_expenditures" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cash_on_hand" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "debts_owed" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "debts_owed_to_committee" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "coverage_start_date" TIMESTAMP(3),
    "coverage_end_date" TIMESTAMP(3),
    "transaction_coverage_date" TIMESTAMP(3),
    "last_report_year" INTEGER,
    "last_report_type_full" TEXT,
    "last_beginning_image_number" TEXT,
    "election_full" BOOLEAN,
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_financials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "committees" (
    "id" TEXT NOT NULL,
    "committee_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "committee_type" TEXT,
    "designation" TEXT,
    "candidate_id" TEXT,
    "party" TEXT,
    "state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "committees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elections" (
    "id" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "district" TEXT,
    "office_type" TEXT NOT NULL,
    "election_date" TIMESTAMP(3) NOT NULL,
    "election_type" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "elections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "candidate_elections" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "election_id" TEXT NOT NULL,
    "is_incumbent" BOOLEAN NOT NULL DEFAULT false,
    "result" TEXT,
    "vote_percentage" DOUBLE PRECISION,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidate_elections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_summaries" (
    "id" TEXT NOT NULL,
    "committee_id" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "total_receipts" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "total_disbursements" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "cash_on_hand" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "debt_owed" DECIMAL(15,2) NOT NULL DEFAULT 0,
    "coverage_end_date" TIMESTAMP(3),
    "last_updated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "financial_summaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "committee_id" TEXT NOT NULL,
    "contributor_name" TEXT,
    "contributor_state" TEXT,
    "contributor_city" TEXT,
    "contributor_employer" TEXT,
    "contributor_occupation" TEXT,
    "contribution_receipt_amount" DECIMAL(15,2) NOT NULL,
    "contribution_receipt_date" TIMESTAMP(3),
    "receipt_type" TEXT,
    "image_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "disbursements" (
    "id" TEXT NOT NULL,
    "committee_id" TEXT NOT NULL,
    "recipient_name" TEXT,
    "disbursement_type" TEXT,
    "disbursement_amount" DECIMAL(15,2) NOT NULL,
    "disbursement_date" TIMESTAMP(3),
    "disbursement_description" TEXT,
    "image_number" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "disbursements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ideology_scores" (
    "id" TEXT NOT NULL,
    "candidate_id" TEXT NOT NULL,
    "congress_session" INTEGER NOT NULL,
    "ideology_score" DOUBLE PRECISION,
    "leadership_score" DOUBLE PRECISION,
    "bills_sponsored" INTEGER NOT NULL DEFAULT 0,
    "bills_cosponsored" INTEGER NOT NULL DEFAULT 0,
    "calculated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ideology_scores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_logs" (
    "id" TEXT NOT NULL,
    "sync_type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "records_processed" INTEGER NOT NULL DEFAULT 0,
    "records_errors" INTEGER NOT NULL DEFAULT 0,
    "records_skipped" INTEGER NOT NULL DEFAULT 0,
    "error_message" TEXT,
    "metadata" JSONB,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "duration" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "email" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "counties" (
    "fips_code" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "districts" TEXT[],
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "counties_pkey" PRIMARY KEY ("fips_code")
);

-- CreateTable
CREATE TABLE "county_results" (
    "id" TEXT NOT NULL,
    "county_fips" TEXT NOT NULL,
    "cycle" INTEGER NOT NULL,
    "state" TEXT NOT NULL,
    "office_type" TEXT NOT NULL,
    "district" TEXT NOT NULL DEFAULT '',
    "party" TEXT NOT NULL,
    "candidate_name" TEXT NOT NULL,
    "votes" INTEGER NOT NULL,
    "vote_pct" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "county_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "researcher_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "name" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "researcher_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_simulations" (
    "id" TEXT NOT NULL,
    "researcher_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "params" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_simulations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deadlines" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "type" TEXT NOT NULL,
    "states" TEXT[],
    "description" TEXT,
    "urgent" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deadlines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "candidates_candidate_id_key" ON "candidates"("candidate_id");

-- CreateIndex
CREATE INDEX "candidates_candidate_id_idx" ON "candidates"("candidate_id");

-- CreateIndex
CREATE INDEX "candidates_name_idx" ON "candidates"("name");

-- CreateIndex
CREATE INDEX "candidates_state_idx" ON "candidates"("state");

-- CreateIndex
CREATE INDEX "candidates_party_idx" ON "candidates"("party");

-- CreateIndex
CREATE INDEX "candidates_office_idx" ON "candidates"("office");

-- CreateIndex
CREATE INDEX "candidate_financials_candidate_id_idx" ON "candidate_financials"("candidate_id");

-- CreateIndex
CREATE INDEX "candidate_financials_cycle_idx" ON "candidate_financials"("cycle");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_financials_candidate_id_cycle_key" ON "candidate_financials"("candidate_id", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "committees_committee_id_key" ON "committees"("committee_id");

-- CreateIndex
CREATE INDEX "committees_committee_id_idx" ON "committees"("committee_id");

-- CreateIndex
CREATE INDEX "committees_candidate_id_idx" ON "committees"("candidate_id");

-- CreateIndex
CREATE INDEX "committees_state_idx" ON "committees"("state");

-- CreateIndex
CREATE INDEX "elections_state_idx" ON "elections"("state");

-- CreateIndex
CREATE INDEX "elections_election_date_idx" ON "elections"("election_date");

-- CreateIndex
CREATE INDEX "elections_cycle_idx" ON "elections"("cycle");

-- CreateIndex
CREATE INDEX "elections_office_type_idx" ON "elections"("office_type");

-- CreateIndex
CREATE INDEX "candidate_elections_candidate_id_idx" ON "candidate_elections"("candidate_id");

-- CreateIndex
CREATE INDEX "candidate_elections_election_id_idx" ON "candidate_elections"("election_id");

-- CreateIndex
CREATE UNIQUE INDEX "candidate_elections_candidate_id_election_id_key" ON "candidate_elections"("candidate_id", "election_id");

-- CreateIndex
CREATE INDEX "financial_summaries_committee_id_idx" ON "financial_summaries"("committee_id");

-- CreateIndex
CREATE INDEX "financial_summaries_cycle_idx" ON "financial_summaries"("cycle");

-- CreateIndex
CREATE UNIQUE INDEX "financial_summaries_committee_id_cycle_key" ON "financial_summaries"("committee_id", "cycle");

-- CreateIndex
CREATE INDEX "receipts_committee_id_idx" ON "receipts"("committee_id");

-- CreateIndex
CREATE INDEX "receipts_contributor_name_idx" ON "receipts"("contributor_name");

-- CreateIndex
CREATE INDEX "receipts_contribution_receipt_date_idx" ON "receipts"("contribution_receipt_date");

-- CreateIndex
CREATE INDEX "receipts_contribution_receipt_amount_idx" ON "receipts"("contribution_receipt_amount");

-- CreateIndex
CREATE INDEX "disbursements_committee_id_idx" ON "disbursements"("committee_id");

-- CreateIndex
CREATE INDEX "disbursements_disbursement_date_idx" ON "disbursements"("disbursement_date");

-- CreateIndex
CREATE INDEX "disbursements_disbursement_amount_idx" ON "disbursements"("disbursement_amount");

-- CreateIndex
CREATE INDEX "ideology_scores_candidate_id_idx" ON "ideology_scores"("candidate_id");

-- CreateIndex
CREATE INDEX "ideology_scores_congress_session_idx" ON "ideology_scores"("congress_session");

-- CreateIndex
CREATE UNIQUE INDEX "ideology_scores_candidate_id_congress_session_key" ON "ideology_scores"("candidate_id", "congress_session");

-- CreateIndex
CREATE INDEX "sync_logs_sync_type_idx" ON "sync_logs"("sync_type");

-- CreateIndex
CREATE INDEX "sync_logs_status_idx" ON "sync_logs"("status");

-- CreateIndex
CREATE INDEX "sync_logs_started_at_idx" ON "sync_logs"("started_at");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_username_key" ON "admin_users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "admin_users_username_idx" ON "admin_users"("username");

-- CreateIndex
CREATE INDEX "admin_users_email_idx" ON "admin_users"("email");

-- CreateIndex
CREATE INDEX "counties_state_idx" ON "counties"("state");

-- CreateIndex
CREATE INDEX "county_results_cycle_state_office_type_idx" ON "county_results"("cycle", "state", "office_type");

-- CreateIndex
CREATE INDEX "county_results_state_district_cycle_idx" ON "county_results"("state", "district", "cycle");

-- CreateIndex
CREATE UNIQUE INDEX "county_results_county_fips_cycle_office_type_district_candi_key" ON "county_results"("county_fips", "cycle", "office_type", "district", "candidate_name");

-- CreateIndex
CREATE UNIQUE INDEX "researcher_users_email_key" ON "researcher_users"("email");

-- CreateIndex
CREATE INDEX "researcher_users_email_idx" ON "researcher_users"("email");

-- CreateIndex
CREATE INDEX "saved_simulations_researcher_id_idx" ON "saved_simulations"("researcher_id");

-- CreateIndex
CREATE INDEX "deadlines_date_idx" ON "deadlines"("date");

-- CreateIndex
CREATE INDEX "deadlines_is_active_idx" ON "deadlines"("is_active");

-- AddForeignKey
ALTER TABLE "candidate_financials" ADD CONSTRAINT "candidate_financials_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("candidate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "committees" ADD CONSTRAINT "committees_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("candidate_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_elections" ADD CONSTRAINT "candidate_elections_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("candidate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "candidate_elections" ADD CONSTRAINT "candidate_elections_election_id_fkey" FOREIGN KEY ("election_id") REFERENCES "elections"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_summaries" ADD CONSTRAINT "financial_summaries_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("committee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("committee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "disbursements" ADD CONSTRAINT "disbursements_committee_id_fkey" FOREIGN KEY ("committee_id") REFERENCES "committees"("committee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ideology_scores" ADD CONSTRAINT "ideology_scores_candidate_id_fkey" FOREIGN KEY ("candidate_id") REFERENCES "candidates"("candidate_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "county_results" ADD CONSTRAINT "county_results_county_fips_fkey" FOREIGN KEY ("county_fips") REFERENCES "counties"("fips_code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_simulations" ADD CONSTRAINT "saved_simulations_researcher_id_fkey" FOREIGN KEY ("researcher_id") REFERENCES "researcher_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
