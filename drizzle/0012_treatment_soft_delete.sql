ALTER TABLE "treatments" ADD COLUMN "batch_id" text;--> statement-breakpoint
ALTER TABLE "treatments" ADD COLUMN "deleted_at" timestamp;--> statement-breakpoint
CREATE INDEX "treatments_batch_id_idx" ON "treatments" USING btree ("batch_id");