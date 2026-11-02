-- NBC News's election-night YouTube video (https://youtu.be/b043z24ErQk), given by the product owner on Nov 2.
-- Data only. Set only when no admin has chosen a video or channel for NBC News yet, so a link pasted in
-- Admin > Live coverage always wins. Admins can change or clear it there on the night.
UPDATE "live_streams"
SET "video_id" = 'b043z24ErQk', "note" = 'Election-night video set Nov 2 (youtu.be/b043z24ErQk). Replace it in Admin > Live coverage if NBC posts a new stream.', "updated_at" = CURRENT_TIMESTAMP
WHERE "key" = 'nbc-news' AND "video_id" IS NULL AND "channel_id" IS NULL;
