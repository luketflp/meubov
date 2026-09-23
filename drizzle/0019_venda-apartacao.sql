ALTER TYPE "public"."manejo_outcome" ADD VALUE 'rejected';--> statement-breakpoint
ALTER TYPE "public"."manejo_outcome" ADD VALUE 'held';--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD COLUMN "carcass_yield_pct" numeric;