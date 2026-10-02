CREATE TYPE "public"."entry_flow" AS ENUM('in', 'out');--> statement-breakpoint
ALTER TYPE "public"."account_group" ADD VALUE 'investment';--> statement-breakpoint
ALTER TYPE "public"."account_group" ADD VALUE 'financing';--> statement-breakpoint
ALTER TYPE "public"."account_group" ADD VALUE 'partners';--> statement-breakpoint
ALTER TYPE "public"."bank_account_kind" ADD VALUE 'investment';--> statement-breakpoint
ALTER TYPE "public"."entry_kind" ADD VALUE 'investment';--> statement-breakpoint
ALTER TYPE "public"."entry_kind" ADD VALUE 'financing';--> statement-breakpoint
ALTER TYPE "public"."entry_kind" ADD VALUE 'partners';--> statement-breakpoint
ALTER TYPE "public"."entry_kind" ADD VALUE 'yield';--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "opening_balance_brl" numeric;--> statement-breakpoint
ALTER TABLE "accounts" ADD COLUMN "opening_date" date;--> statement-breakpoint
ALTER TABLE "expense_series" ADD COLUMN "flow" "entry_flow";--> statement-breakpoint
ALTER TABLE "expenses" ADD COLUMN "flow" "entry_flow";