CREATE TABLE "expense_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ALTER COLUMN "group" SET DATA TYPE text USING "group"::text;--> statement-breakpoint
ALTER TABLE "budgets" ALTER COLUMN "category" SET DATA TYPE text USING "category"::text;--> statement-breakpoint
ALTER TABLE "expense_series" ALTER COLUMN "category" SET DATA TYPE text USING "category"::text;--> statement-breakpoint
ALTER TABLE "expenses" ALTER COLUMN "category" SET DATA TYPE text USING "category"::text;--> statement-breakpoint
ALTER TABLE "expense_groups" ADD CONSTRAINT "expense_groups_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_groups_farm_name_idx" ON "expense_groups" USING btree ("farm_id",lower("name"));--> statement-breakpoint
DROP TYPE "public"."account_group";--> statement-breakpoint
DROP TYPE "public"."expense_category";