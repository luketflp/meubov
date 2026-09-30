CREATE TYPE "public"."bank_account_kind" AS ENUM('checking', 'cash', 'card');--> statement-breakpoint
CREATE TYPE "public"."statement_format" AS ENUM('ofx', 'csv');--> statement-breakpoint
CREATE TYPE "public"."statement_line_status" AS ENUM('pending', 'matched', 'created', 'transfer', 'ignored');--> statement-breakpoint
CREATE TABLE "bank_accounts" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"kind" "bank_account_kind" NOT NULL,
	"name" text NOT NULL,
	"label" text,
	"opening_balance_brl" numeric DEFAULT 0 NOT NULL,
	"opening_date" date NOT NULL,
	"is_main" boolean DEFAULT false NOT NULL,
	"closing_day" integer,
	"due_day" integer,
	"pays_from_id" text,
	"csv_mapping" jsonb,
	"archived_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "bank_accounts_closing_day_check" CHECK ("bank_accounts"."closing_day" between 1 and 31),
	CONSTRAINT "bank_accounts_due_day_check" CHECK ("bank_accounts"."due_day" between 1 and 31)
);
--> statement-breakpoint
CREATE TABLE "statement_imports" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"bank_account_id" text NOT NULL,
	"file_name" text NOT NULL,
	"format" "statement_format" NOT NULL,
	"period_from" date NOT NULL,
	"period_to" date NOT NULL,
	"bank_balance_brl" numeric,
	"bank_balance_date" date,
	"line_count" integer NOT NULL,
	"skipped_count" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "statement_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"bank_account_id" text NOT NULL,
	"import_id" text NOT NULL,
	"date" date NOT NULL,
	"description" text NOT NULL,
	"amount_brl" numeric NOT NULL,
	"external_id" text NOT NULL,
	"status" "statement_line_status" DEFAULT 'pending' NOT NULL,
	"expense_id" text,
	"movement_id" text,
	"transfer_id" text,
	"ignore_reason" text,
	"resolved_at" timestamp,
	"resolved_by" text
);
--> statement-breakpoint
CREATE TABLE "transfers" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"from_id" text NOT NULL,
	"to_id" text NOT NULL,
	"date" date NOT NULL,
	"amount_brl" numeric NOT NULL,
	"notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	CONSTRAINT "transfers_accounts_check" CHECK ("transfers"."from_id" <> "transfers"."to_id"),
	CONSTRAINT "transfers_amount_check" CHECK ("transfers"."amount_brl" > 0)
);
--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "bank_account_id" text;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD COLUMN "bank_account_id" text;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "bank_account_id" text;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bank_accounts" ADD CONSTRAINT "bank_accounts_pays_from_id_bank_accounts_id_fk" FOREIGN KEY ("pays_from_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_imports" ADD CONSTRAINT "statement_imports_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_import_id_statement_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."statement_imports"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_transfer_id_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."transfers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_from_id_bank_accounts_id_fk" FOREIGN KEY ("from_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transfers" ADD CONSTRAINT "transfers_to_id_bank_accounts_id_fk" FOREIGN KEY ("to_id") REFERENCES "public"."bank_accounts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bank_accounts_farm_id_idx" ON "bank_accounts" USING btree ("farm_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bank_accounts_farm_id_main_idx" ON "bank_accounts" USING btree ("farm_id") WHERE "bank_accounts"."is_main";--> statement-breakpoint
CREATE INDEX "statement_imports_bank_account_id_idx" ON "statement_imports" USING btree ("bank_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_lines_account_external_idx" ON "statement_lines" USING btree ("bank_account_id","external_id");--> statement-breakpoint
CREATE INDEX "statement_lines_import_id_idx" ON "statement_lines" USING btree ("import_id");--> statement-breakpoint
CREATE INDEX "statement_lines_farm_id_status_idx" ON "statement_lines" USING btree ("farm_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_lines_expense_id_idx" ON "statement_lines" USING btree ("expense_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_lines_movement_id_idx" ON "statement_lines" USING btree ("movement_id");--> statement-breakpoint
CREATE UNIQUE INDEX "statement_lines_transfer_id_idx" ON "statement_lines" USING btree ("transfer_id","bank_account_id");--> statement-breakpoint
CREATE INDEX "transfers_farm_id_idx" ON "transfers" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "expenses_bank_account_id_idx" ON "expenses" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "manejo_sessions_bank_account_id_idx" ON "manejo_sessions" USING btree ("bank_account_id");--> statement-breakpoint
CREATE INDEX "movements_bank_account_id_idx" ON "movements" USING btree ("bank_account_id");--> statement-breakpoint
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD CONSTRAINT "manejo_sessions_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_bank_account_id_bank_accounts_id_fk" FOREIGN KEY ("bank_account_id") REFERENCES "public"."bank_accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
-- Removing the lançamento, venda or transferência a linha points at nulls the pointer
-- (ON DELETE SET NULL, or the manejo removal for a venda); the linha goes back to pending.
CREATE FUNCTION "statement_lines_back_to_pending"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."status" IN ('matched', 'created', 'transfer')
    AND NEW."expense_id" IS NULL AND NEW."movement_id" IS NULL AND NEW."transfer_id" IS NULL THEN
    NEW."status" := 'pending';
    NEW."resolved_at" := NULL;
    NEW."resolved_by" := NULL;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "statement_lines_back_to_pending" BEFORE UPDATE ON "statement_lines"
  FOR EACH ROW EXECUTE FUNCTION "statement_lines_back_to_pending"();
