CREATE TABLE "autograde_reference_runs" (
	"key" text PRIMARY KEY NOT NULL,
	"result" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autograde_reference_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "autograde_runner_calls" (
	"id" text PRIMARY KEY NOT NULL,
	"at" text NOT NULL,
	"job_id" text,
	"duration_ms" integer NOT NULL,
	"kind" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autograde_runner_calls" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "autograde_jobs" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "autograde_runner_calls" ADD CONSTRAINT "autograde_runner_calls_job_id_autograde_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."autograde_jobs"("id") ON DELETE set null ON UPDATE no action;