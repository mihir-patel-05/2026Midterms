-- CreateTable
CREATE TABLE "schedule_e_sync_state" (
    "cycle" INTEGER NOT NULL,
    "backfill_before" DATE,
    "backfill_cursor" JSONB,
    "backfill_started_at" TIMESTAMP(3),
    "backfill_complete" BOOLEAN NOT NULL DEFAULT false,
    "backfill_done_at" TIMESTAMP(3),
    "last_window_synced_at" TIMESTAMP(3),
    "last_error" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_e_sync_state_pkey" PRIMARY KEY ("cycle")
);
