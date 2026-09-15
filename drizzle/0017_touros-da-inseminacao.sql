ALTER TABLE "manejo_sessions" DROP CONSTRAINT "manejo_sessions_semen_bull_id_semen_bulls_id_fk";
--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD COLUMN "semen_bull_ids" jsonb;--> statement-breakpoint
UPDATE "manejo_sessions" SET "semen_bull_ids" = jsonb_build_array("semen_bull_id") WHERE "semen_bull_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "manejo_sessions" DROP COLUMN "semen_bull_id";
