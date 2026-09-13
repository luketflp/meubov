CREATE TYPE "public"."farm_invite_status" AS ENUM('pending', 'accepted', 'declined', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."farm_member_preset" AS ENUM('gerente', 'vaqueiro', 'consultor', 'personalizado');--> statement-breakpoint
CREATE TABLE "farm_invites" (
	"id" serial PRIMARY KEY NOT NULL,
	"farm_id" integer NOT NULL,
	"email" text NOT NULL,
	"preset" "farm_member_preset" NOT NULL,
	"permissions" jsonb NOT NULL,
	"status" "farm_invite_status" DEFAULT 'pending' NOT NULL,
	"invited_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"responded_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "farm_users" ADD COLUMN "preset" "farm_member_preset";--> statement-breakpoint
ALTER TABLE "farm_users" ADD COLUMN "permissions" jsonb;--> statement-breakpoint
ALTER TABLE "farm_invites" ADD CONSTRAINT "farm_invites_farm_id_farm_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farm"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "farm_invites" ADD CONSTRAINT "farm_invites_invited_by_user_id_user_id_fk" FOREIGN KEY ("invited_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "farm_invites_one_pending_per_email_unique" ON "farm_invites" USING btree ("farm_id","email") WHERE "farm_invites"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "farm_invites_email_idx" ON "farm_invites" USING btree ("email");
--> statement-breakpoint
UPDATE "farm_users"
SET "preset" = 'gerente',
    "permissions" = '{"herd":"edit","manejo":"edit","reproduction":"edit","sanitary":"edit","lots":"edit","finance":"edit","farm":"edit","team":"edit"}'::jsonb
WHERE "role" = 'member';