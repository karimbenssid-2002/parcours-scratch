CREATE TABLE "push_subscriptions" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_kind" text NOT NULL,
	"owner_id" text NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "push_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "announced_at" text;--> statement-breakpoint
CREATE UNIQUE INDEX "push_subscriptions_owner_endpoint" ON "push_subscriptions" USING btree ("owner_kind","owner_id","endpoint");
--> statement-breakpoint
-- Activités déjà publiées en ligne : jamais annoncées après coup.
UPDATE "activities" SET "announced_at" = "created_at" WHERE "status" = 'published';
