-- Race calls (civicAPI's decision desk), a test-data flag on result snapshots, and the
-- election-night Live coverage list (PLAN.md §4.7, docs/plans/civicapi-results.md). Additive only.

-- CreateEnum
CREATE TYPE "RaceCallKind" AS ENUM ('WINNER', 'ADVANCED');

-- AlterTable
ALTER TABLE "result_snapshots" ADD COLUMN     "is_test_data" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "race_calls" (
    "id" TEXT NOT NULL,
    "contest_id" TEXT NOT NULL,
    "candidacy_id" TEXT NOT NULL,
    "source_id" TEXT NOT NULL,
    "kind" "RaceCallKind" NOT NULL,
    "called_at" TIMESTAMP(3) NOT NULL,
    "called_at_source" BOOLEAN NOT NULL DEFAULT false,
    "first_seen_at" TIMESTAMP(3) NOT NULL,
    "retracted_at" TIMESTAMP(3),
    "raw_artifact_id" TEXT,
    "is_test_data" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "race_calls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "live_streams" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "channel_id" TEXT,
    "video_id" TEXT,
    "watch_url" TEXT NOT NULL,
    "is_enabled" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "live_streams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "app_settings" (
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "app_settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "race_calls_contest_id_retracted_at_idx" ON "race_calls"("contest_id", "retracted_at");

-- CreateIndex
CREATE INDEX "race_calls_source_id_called_at_idx" ON "race_calls"("source_id", "called_at");

-- CreateIndex
CREATE UNIQUE INDEX "live_streams_key_key" ON "live_streams"("key");

-- AddForeignKey
ALTER TABLE "race_calls" ADD CONSTRAINT "race_calls_contest_id_fkey" FOREIGN KEY ("contest_id") REFERENCES "contests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_calls" ADD CONSTRAINT "race_calls_candidacy_id_fkey" FOREIGN KEY ("candidacy_id") REFERENCES "candidacies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "race_calls" ADD CONSTRAINT "race_calls_source_id_fkey" FOREIGN KEY ("source_id") REFERENCES "data_sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- The outlets on the Live coverage panel, alphabetical by name and treated the same. Channel and video
-- ids are set by an admin on the night (Admin > Live coverage), after checking each outlet's
-- scheduled election-night stream. Until then each tile links out to the outlet.
INSERT INTO "live_streams" ("id", "key", "name", "watch_url", "is_enabled", "note", "updated_at") VALUES
  ('live-stream-abc-news', 'abc-news', 'ABC News', 'https://www.youtube.com/@ABCNews/streams', true, 'ABC News Live. Confirm the election-night stream and paste its video or channel link.', CURRENT_TIMESTAMP),
  ('live-stream-cbs-news', 'cbs-news', 'CBS News', 'https://www.youtube.com/@CBSNews/streams', true, 'CBS News 24/7. Confirm the election-night stream and paste its video or channel link.', CURRENT_TIMESTAMP),
  ('live-stream-cnn', 'cnn', 'CNN', 'https://www.cnn.com', true, 'CNN does not usually stream its TV feed free on YouTube; link-out only unless a YouTube stream is announced.', CURRENT_TIMESTAMP),
  ('live-stream-c-span', 'c-span', 'C-SPAN', 'https://www.youtube.com/@cspan/streams', true, 'Confirm the election-night stream and paste its video or channel link.', CURRENT_TIMESTAMP),
  ('live-stream-livenow-fox', 'livenow-fox', 'LiveNOW from FOX', 'https://www.youtube.com/@LiveNOWFOX/streams', true, 'Fox News itself is mostly behind a TV login; LiveNOW from FOX streams on YouTube.', CURRENT_TIMESTAMP),
  ('live-stream-nbc-news', 'nbc-news', 'NBC News', 'https://www.youtube.com/@NBCNews/streams', true, 'NBC News NOW. Confirm the election-night stream and paste its video or channel link.', CURRENT_TIMESTAMP),
  ('live-stream-pbs-newshour', 'pbs-newshour', 'PBS NewsHour', 'https://www.youtube.com/@PBSNewsHour/streams', true, 'Confirm the election-night stream and paste its video or channel link.', CURRENT_TIMESTAMP),
  ('live-stream-reuters', 'reuters', 'Reuters', 'https://www.youtube.com/@Reuters/streams', false, 'Optional extra; enable if it streams election night.', CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
