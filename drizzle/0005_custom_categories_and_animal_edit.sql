CREATE TYPE "public"."inactive_reason" AS ENUM('sale', 'death', 'loss', 'other');--> statement-breakpoint
CREATE TABLE "custom_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"name" text NOT NULL,
	"base_category" "category" NOT NULL
);
--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "custom_category_id" text;--> statement-breakpoint
ALTER TABLE "animals" ADD COLUMN "inactive_reason" "inactive_reason";--> statement-breakpoint
ALTER TABLE "custom_categories" ADD CONSTRAINT "custom_categories_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "custom_categories_farm_id_name_unique" ON "custom_categories" USING btree ("farm_id","name");--> statement-breakpoint
ALTER TABLE "animals" ADD CONSTRAINT "animals_custom_category_id_custom_categories_id_fk" FOREIGN KEY ("custom_category_id") REFERENCES "public"."custom_categories"("id") ON DELETE set null ON UPDATE no action;