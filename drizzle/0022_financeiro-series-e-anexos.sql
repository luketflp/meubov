CREATE TYPE "public"."series_frequency" AS ENUM('monthly', 'weekly');--> statement-breakpoint
CREATE TYPE "public"."series_mode" AS ENUM('installments', 'recurring');--> statement-breakpoint
CREATE TABLE "attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"expense_id" text NOT NULL,
	"pathname" text NOT NULL,
	"file_name" text NOT NULL,
	"content_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "attachments_pathname_unique" UNIQUE("pathname")
);
--> statement-breakpoint
CREATE TABLE "expense_series" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"mode" "series_mode" NOT NULL,
	"frequency" "series_frequency" NOT NULL,
	"day_of_month" integer,
	"starts_on" date NOT NULL,
	"ends_on" date,
	"count" integer,
	"generated_count" integer DEFAULT 0 NOT NULL,
	"kind" "entry_kind" DEFAULT 'expense' NOT NULL,
	"category" "expense_category" NOT NULL,
	"amount_brl" numeric NOT NULL,
	"account_id" text,
	"lot_id" text,
	"counterparty" text,
	"document" text,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "expense_series_day_of_month_check" CHECK ("expense_series"."day_of_month" between 1 and 31),
	CONSTRAINT "expense_series_count_check" CHECK ("expense_series"."count" between 2 and 48)
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "series_id" text;--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "series_index" integer;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_series" ADD CONSTRAINT "expense_series_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attachments_expense_id_idx" ON "attachments" USING btree ("expense_id");--> statement-breakpoint
CREATE INDEX "expense_series_farm_id_idx" ON "expense_series" USING btree ("farm_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_series_id_expense_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."expense_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "expenses_series_id_series_index_idx" ON "expenses" USING btree ("series_id","series_index");