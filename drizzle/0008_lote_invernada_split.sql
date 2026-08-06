CREATE TABLE "invernadas" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"code" text NOT NULL,
	"name" text,
	"grass" text NOT NULL,
	"hectares" numeric NOT NULL,
	"boundary" jsonb
);
--> statement-breakpoint
ALTER TABLE "lots" ADD COLUMN "needs_review" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "grass" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "lots" ALTER COLUMN "hectares" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "invernadas" ADD CONSTRAINT "invernadas_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invernadas_farm_id_code_unique" ON "invernadas" USING btree ("farm_id","code");--> statement-breakpoint
CREATE INDEX "invernadas_farm_id_idx" ON "invernadas" USING btree ("farm_id");--> statement-breakpoint

-- The former lots were physical paddocks. Preserve each id so current animal
-- references remain valid while the row is also copied to its new physical
-- identity. The synthetic code is deliberately conspicuous and may be
-- corrected exactly once through Settings; after that the code is immutable.
INSERT INTO "invernadas" (
	"id",
	"farm_id",
	"code",
	"name",
	"grass",
	"hectares",
	"boundary"
)
SELECT
	"id",
	"farm_id",
	'LEGACY-' || "id",
	"name",
	"grass",
	"hectares",
	"boundary"
FROM "lots";--> statement-breakpoint

UPDATE "lots" SET "needs_review" = true;--> statement-breakpoint

CREATE TABLE "lot_placements" (
	"id" text PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"lot_id" text NOT NULL,
	"invernada_id" text NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"notes" text,
	"baseline" boolean DEFAULT false NOT NULL,
	CONSTRAINT "lot_placements_valid_period_check" CHECK ("lot_placements"."ended_on" is null or "lot_placements"."ended_on" > "lot_placements"."started_on")
);
--> statement-breakpoint
ALTER TABLE "lot_placements" ADD CONSTRAINT "lot_placements_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_placements" ADD CONSTRAINT "lot_placements_lot_id_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "lot_placements" ADD CONSTRAINT "lot_placements_invernada_id_invernadas_id_fk" FOREIGN KEY ("invernada_id") REFERENCES "public"."invernadas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "lot_placements_one_open_per_lot_unique" ON "lot_placements" USING btree ("lot_id") WHERE "lot_placements"."ended_on" is null;--> statement-breakpoint
CREATE INDEX "lot_placements_farm_id_idx" ON "lot_placements" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "lot_placements_lot_id_started_on_idx" ON "lot_placements" USING btree ("lot_id","started_on");--> statement-breakpoint
CREATE INDEX "lot_placements_invernada_id_idx" ON "lot_placements" USING btree ("invernada_id");--> statement-breakpoint

-- We know only the current location at cutover, not historical rotations. The
-- baseline begins one day before cutover so a farmer may record a real move on
-- migration day while dates remain strictly increasing. Prefixing the existing
-- id gives every row a deterministic unique id without a UUID extension.
INSERT INTO "lot_placements" (
	"id",
	"farm_id",
	"lot_id",
	"invernada_id",
	"started_on",
	"baseline"
)
SELECT
	'baseline:' || "id",
	"farm_id",
	"id",
	"id",
	(CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo')::date - 1,
	true
FROM "lots";
