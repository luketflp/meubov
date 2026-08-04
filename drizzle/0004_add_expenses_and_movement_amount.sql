CREATE TYPE "public"."expense_category" AS ENUM('nutrition', 'pasture', 'labor', 'health', 'breeding', 'admin', 'other');--> statement-breakpoint
CREATE TABLE "expenses" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"date" date NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_brl" numeric NOT NULL,
	"notes" text
);
--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "amount_brl" numeric;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "expenses_farm_id_date_idx" ON "expenses" USING btree ("farm_id","date");