DROP INDEX "invernadas_farm_id_code_unique";--> statement-breakpoint
ALTER TABLE "invernadas" ADD COLUMN "removed_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "invernadas_farm_id_code_unique" ON "invernadas" USING btree ("farm_id","code") WHERE "invernadas"."removed_at" is null;