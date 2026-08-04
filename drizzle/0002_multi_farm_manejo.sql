CREATE TYPE "public"."farm_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."manejo_outcome" AS ENUM('pending', 'done', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."manejo_session_status" AS ENUM('open', 'closed');--> statement-breakpoint
CREATE TABLE "farm_users" (
	"farm_id" integer NOT NULL,
	"user_id" text NOT NULL,
	"role" "farm_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "farm_users_farm_id_user_id_pk" PRIMARY KEY("farm_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "manejo_session_animals" (
	"session_id" text NOT NULL,
	"animal_id" text NOT NULL,
	"outcome" "manejo_outcome" DEFAULT 'pending' NOT NULL,
	"weight_kg" numeric,
	"notes" text,
	"treatment_id" text,
	"booster_id" text,
	"weighing_id" integer,
	CONSTRAINT "manejo_session_animals_session_id_animal_id_pk" PRIMARY KEY("session_id","animal_id")
);
--> statement-breakpoint
CREATE TABLE "manejo_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"status" "manejo_session_status" DEFAULT 'open' NOT NULL,
	"weighing" boolean NOT NULL,
	"notes" text,
	"plan_type" "treatment_type",
	"plan_name" text,
	"plan_withdrawal_days" integer,
	"plan_dose" text,
	"plan_responsible" text,
	"plan_cost_brl" numeric,
	"plan_next_date" date,
	"plan_notes" text
);
--> statement-breakpoint
ALTER TABLE "breedings" DROP CONSTRAINT "breedings_animal_ear_tag_animals_ear_tag_fk";
--> statement-breakpoint
ALTER TABLE "calvings" DROP CONSTRAINT "calvings_animal_ear_tag_animals_ear_tag_fk";
--> statement-breakpoint
ALTER TABLE "pregnancy_diagnoses" DROP CONSTRAINT "pregnancy_diagnoses_breeding_id_breedings_id_fk";
--> statement-breakpoint
ALTER TABLE "treatments" DROP CONSTRAINT "treatments_animal_ear_tag_animals_ear_tag_fk";
--> statement-breakpoint
ALTER TABLE "weighings" DROP CONSTRAINT "weighings_animal_ear_tag_animals_ear_tag_fk";
--> statement-breakpoint
ALTER TABLE "animals" DROP CONSTRAINT "animals_pkey";--> statement-breakpoint
ALTER TABLE "breeds" DROP CONSTRAINT "breeds_pkey";--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "id" text PRIMARY KEY NOT NULL;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "farm_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "breedings" ADD COLUMN "animal_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "breeds" ADD COLUMN "farm_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_farm_id_name_pk" PRIMARY KEY("farm_id","name");--> statement-breakpoint
ALTER TABLE "calvings" ADD COLUMN "animal_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "headquarters_lat" numeric;--> statement-breakpoint
ALTER TABLE "farm" ADD COLUMN "headquarters_lng" numeric;--> statement-breakpoint
ALTER TABLE "health_protocols" ADD COLUMN "farm_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "farm_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "boundary" jsonb;--> statement-breakpoint
ALTER TABLE "movements" ADD COLUMN "farm_id" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "treatments" ADD COLUMN "animal_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "treatments" ADD COLUMN "dose" text;--> statement-breakpoint
ALTER TABLE "treatments" ADD COLUMN "responsible" text;--> statement-breakpoint
ALTER TABLE "treatments" ADD COLUMN "cost_brl" numeric;--> statement-breakpoint
ALTER TABLE "weighings" ADD COLUMN "animal_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "farm_users" ADD CONSTRAINT "farm_users_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_users" ADD CONSTRAINT "farm_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD CONSTRAINT "manejo_session_animals_session_id_manejo_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."manejo_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD CONSTRAINT "manejo_session_animals_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD CONSTRAINT "manejo_session_animals_treatment_id_treatments_id_fk" FOREIGN KEY ("treatment_id") REFERENCES "public"."treatments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD CONSTRAINT "manejo_session_animals_booster_id_treatments_id_fk" FOREIGN KEY ("booster_id") REFERENCES "public"."treatments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_session_animals" ADD CONSTRAINT "manejo_session_animals_weighing_id_weighings_id_fk" FOREIGN KEY ("weighing_id") REFERENCES "public"."weighings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "manejo_sessions" ADD CONSTRAINT "manejo_sessions_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "farm_users_user_id_idx" ON "farm_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "manejo_sessions_farm_id_idx" ON "manejo_sessions" USING btree ("farm_id");--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breedings" ADD CONSTRAINT "breedings_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breeds" ADD CONSTRAINT "breeds_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calvings" ADD CONSTRAINT "calvings_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "health_protocols" ADD CONSTRAINT "health_protocols_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lots" ADD CONSTRAINT "lots_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "movements" ADD CONSTRAINT "movements_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_diagnoses" ADD CONSTRAINT "pregnancy_diagnoses_breeding_id_breedings_id_fk" FOREIGN KEY ("breeding_id") REFERENCES "public"."breedings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weighings" ADD CONSTRAINT "weighings_animal_id_animals_id_fk" FOREIGN KEY ("animal_id") REFERENCES "public"."animals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "animals_farm_id_ear_tag_unique" ON "animals" USING btree ("farm_id","ear_tag");--> statement-breakpoint
CREATE INDEX "animals_farm_id_idx" ON "animals" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "treatments_animal_id_date_idx" ON "treatments" USING btree ("animal_id","date");--> statement-breakpoint
CREATE INDEX "weighings_animal_id_date_idx" ON "weighings" USING btree ("animal_id","date");--> statement-breakpoint
ALTER TABLE "breedings" DROP COLUMN "animal_ear_tag";--> statement-breakpoint
ALTER TABLE "calvings" DROP COLUMN "animal_ear_tag";--> statement-breakpoint
ALTER TABLE "treatments" DROP COLUMN "animal_ear_tag";--> statement-breakpoint
ALTER TABLE "weighings" DROP COLUMN "animal_ear_tag";