CREATE TYPE "public"."manejo_kind" AS ENUM('health', 'weighing', 'transfer', 'sale', 'entry');--> statement-breakpoint
ALTER TABLE "movements" ALTER COLUMN "quantity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "movements" ALTER COLUMN "category" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD COLUMN "amount_brl" numeric;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD COLUMN "previous_lot_id" text;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD COLUMN "created_animal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD COLUMN "kind" "manejo_kind" DEFAULT 'health' NOT NULL;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD COLUMN "destination_lot_id" text;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD COLUMN "price_per_arroba" numeric;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD COLUMN "total_amount_brl" numeric;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD CONSTRAINT "manejo_session_animals_previous_lot_id_lots_id_fk" FOREIGN KEY ("previous_lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD CONSTRAINT "manejo_sessions_destination_lot_id_lots_id_fk" FOREIGN KEY ("destination_lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Sessions written before `kind` existed: a sanitary plan means health, the rest were weighings.
UPDATE "manejo_sessions" SET "kind" = 'weighing' WHERE "plan_type" IS NULL;