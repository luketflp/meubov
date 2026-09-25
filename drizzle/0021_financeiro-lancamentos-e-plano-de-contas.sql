CREATE TYPE "public"."account_group" AS ENUM('nutrition', 'pasture', 'labor', 'health', 'breeding', 'admin', 'other', 'revenue');--> statement-breakpoint
CREATE TYPE "public"."entry_kind" AS ENUM('expense', 'revenue');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"group" "account_group" NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "kind" "entry_kind" DEFAULT 'expense' NOT NULL;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "paid_at" date;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "counterparty" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "document" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "account_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "lot_id" text;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_farm_id_group_name_idx" ON "accounts" USING btree ("farm_id","group",lower("name"));--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "expenses" SET "paid_at" = "date" WHERE "paid_at" IS NULL;