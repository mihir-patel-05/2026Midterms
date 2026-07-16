ALTER TABLE "committees"
ADD COLUMN "itemized_last_attempted_at" TIMESTAMP(3);

CREATE INDEX "committees_itemized_last_attempted_at_idx"
ON "committees"("itemized_last_attempted_at");
