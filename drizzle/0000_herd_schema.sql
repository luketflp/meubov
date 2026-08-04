CREATE TYPE "public"."breeding_type" AS ENUM('timedAI', 'naturalMating');--> statement-breakpoint
CREATE TYPE "public"."category" AS ENUM('calf', 'heifer', 'steer', 'cow', 'bull');--> statement-breakpoint
CREATE TYPE "public"."diagnosis_result" AS ENUM('pregnant', 'open', 'pending');--> statement-breakpoint
CREATE TYPE "public"."movement_type" AS ENUM('purchase', 'sale', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."sex" AS ENUM('male', 'female');--> statement-breakpoint
CREATE TYPE "public"."treatment_status" AS ENUM('scheduled', 'overdue', 'done');--> statement-breakpoint
CREATE TYPE "public"."treatment_type" AS ENUM('vaccine', 'deworming', 'medication', 'exam');--> statement-breakpoint
CREATE TABLE "animals" (
	"ear_tag" text PRIMARY KEY NOT NULL,
	"category" "category" NOT NULL,
	"breed" text NOT NULL,
	"sex" "sex" NOT NULL,
	"birth_date" date NOT NULL,
	"lot_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breedings" (
	"id" text PRIMARY KEY NOT NULL,
	"animal_ear_tag" text NOT NULL,
	"date" date NOT NULL,
	"type" "breeding_type" NOT NULL,
	"bull_ear_tag" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "breeds" (
	"name" text PRIMARY KEY NOT NULL
);
--> statement-breakpoint
CREATE TABLE "calvings" (
	"id" serial PRIMARY KEY NOT NULL,
	"animal_ear_tag" text NOT NULL,
	"date" date NOT NULL,
	"calf_ear_tag" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "farm" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"municipality" text NOT NULL,
	"state_registration" text NOT NULL,
	"manager" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health_protocols" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"type" "treatment_type" NOT NULL,
	"interval_months" integer NOT NULL,
	"withdrawal_days" integer NOT NULL,
	"mandatory" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "lots" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"grass" text NOT NULL,
	"hectares" numeric NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movements" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "movement_type" NOT NULL,
	"date" date NOT NULL,
	"quantity" integer NOT NULL,
	"category" "category" NOT NULL,
	"origin" text NOT NULL,
	"destination" text NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "pregnancy_diagnoses" (
	"breeding_id" text PRIMARY KEY NOT NULL,
	"result" "diagnosis_result" NOT NULL,
	"date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "treatments" (
	"id" text PRIMARY KEY NOT NULL,
	"animal_ear_tag" text NOT NULL,
	"type" "treatment_type" NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"status" "treatment_status" NOT NULL,
	"withdrawal_days" integer NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "weighings" (
	"id" serial PRIMARY KEY NOT NULL,
	"animal_ear_tag" text NOT NULL,
	"date" date NOT NULL,
	"weight_kg" numeric NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "breedings" ADD CONSTRAINT "breedings_animal_ear_tag_animals_ear_tag_fk" FOREIGN KEY ("animal_ear_tag") REFERENCES "public"."animals"("ear_tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "calvings" ADD CONSTRAINT "calvings_animal_ear_tag_animals_ear_tag_fk" FOREIGN KEY ("animal_ear_tag") REFERENCES "public"."animals"("ear_tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pregnancy_diagnoses" ADD CONSTRAINT "pregnancy_diagnoses_breeding_id_breedings_id_fk" FOREIGN KEY ("breeding_id") REFERENCES "public"."breedings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "treatments" ADD CONSTRAINT "treatments_animal_ear_tag_animals_ear_tag_fk" FOREIGN KEY ("animal_ear_tag") REFERENCES "public"."animals"("ear_tag") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weighings" ADD CONSTRAINT "weighings_animal_ear_tag_animals_ear_tag_fk" FOREIGN KEY ("animal_ear_tag") REFERENCES "public"."animals"("ear_tag") ON DELETE no action ON UPDATE no action;