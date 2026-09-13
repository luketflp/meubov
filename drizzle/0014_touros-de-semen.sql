ALTER TYPE "public"."manejo_kind" ADD VALUE 'insemination';--> statement-breakpoint
CREATE TABLE "semen_bulls" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"code" text,
	"breed" text,
	"central" text
);
--> statement-breakpoint
CREATE TABLE "semen_purchases" (
	"id" text PRIMARY KEY NOT NULL,
	"bull_id" text NOT NULL,
	"date" date NOT NULL,
	"doses" integer NOT NULL,
	"total_brl" numeric NOT NULL,
	"seller" text,
	"expense_id" text,
	CONSTRAINT "semen_purchases_doses_positive" CHECK ("semen_purchases"."doses" > 0)
);
--> statement-breakpoint
ALTER TABLE "breedings" ADD COLUMN "semen_bull_id" text;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD COLUMN "breeding_id" text;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD COLUMN "semen_bull_id" text;--> statement-breakpoint
ALTER TABLE "semen_bulls" ADD CONSTRAINT "semen_bulls_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semen_purchases" ADD CONSTRAINT "semen_purchases_bull_id_semen_bulls_id_fk" FOREIGN KEY ("bull_id") REFERENCES "public"."semen_bulls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "semen_purchases" ADD CONSTRAINT "semen_purchases_expense_id_expenses_id_fk" FOREIGN KEY ("expense_id") REFERENCES "public"."expenses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "semen_bulls_farm_id_name_idx" ON "semen_bulls" USING btree ("farm_id",lower("name"));--> statement-breakpoint
CREATE INDEX "semen_purchases_bull_id_idx" ON "semen_purchases" USING btree ("bull_id");--> statement-breakpoint
ALTER TABLE "breedings" ADD CONSTRAINT "breedings_semen_bull_id_semen_bulls_id_fk" FOREIGN KEY ("semen_bull_id") REFERENCES "public"."semen_bulls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD CONSTRAINT "manejo_session_animals_breeding_id_breedings_id_fk" FOREIGN KEY ("breeding_id") REFERENCES "public"."breedings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD CONSTRAINT "manejo_sessions_semen_bull_id_semen_bulls_id_fk" FOREIGN KEY ("semen_bull_id") REFERENCES "public"."semen_bulls"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "breedings_semen_bull_id_idx" ON "breedings" USING btree ("semen_bull_id");