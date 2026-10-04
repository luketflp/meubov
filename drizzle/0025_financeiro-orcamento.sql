CREATE TYPE "public"."budget_distribution" AS ENUM('equal', 'previous', 'manual');--> statement-breakpoint
CREATE TABLE "budgets" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"category" "expense_category" NOT NULL,
	"account_id" text,
	"month" date NOT NULL,
	"amount_brl" numeric NOT NULL,
	"distribution" "budget_distribution" NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "budgets_amount_check" CHECK ("budgets"."amount_brl" >= 0)
);
--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "safra_start_month" integer DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "budgets_line_month_idx" ON "budgets" USING btree ("farm_id","category",coalesce("account_id", ''),"month");--> statement-breakpoint
CREATE INDEX "budgets_farm_id_month_idx" ON "budgets" USING btree ("farm_id","month");--> statement-breakpoint
ALTER TABLE "farm" ADD CONSTRAINT "farm_safra_start_month_check" CHECK ("farm"."safra_start_month" between 1 and 12);