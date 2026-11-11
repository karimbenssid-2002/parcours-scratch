CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"capytale_url" text,
	"capytale_nid" text,
	"starter_project_path" text,
	"starter_source" text,
	"statement_youtube_id" text,
	"instructions" text,
	"thumbnail" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"source" text DEFAULT 'admin' NOT NULL,
	"source_ref" integer,
	"created_at" text NOT NULL,
	"updated_at" text NOT NULL,
	CONSTRAINT "activities_slug_unique" UNIQUE("slug"),
	CONSTRAINT "activities_source_ref_unique" UNIQUE("source_ref")
);
--> statement-breakpoint
ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_autograde" (
	"activity_id" text PRIMARY KEY NOT NULL,
	"solution_path" text,
	"solution_format" text,
	"criteria" text DEFAULT '[]' NOT NULL,
	"answers" text DEFAULT '[]' NOT NULL,
	"keys" text DEFAULT '[]' NOT NULL,
	"duration_ms" integer DEFAULT 10000 NOT NULL,
	"updated_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_autograde" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "activity_help_videos" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"title" text NOT NULL,
	"youtube_id" text NOT NULL,
	"position" integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activity_help_videos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "autograde_jobs" (
	"id" text PRIMARY KEY NOT NULL,
	"progress_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"run_id" text,
	"mode" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"submitted_at" text NOT NULL,
	"prepared" text,
	"result" text,
	"error" text,
	"created_at" text NOT NULL,
	"started_at" text,
	"finished_at" text
);
--> statement-breakpoint
ALTER TABLE "autograde_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "autograde_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"class_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"mode" text NOT NULL,
	"batch_id" text,
	"created_at" text NOT NULL,
	"finished_at" text
);
--> statement-breakpoint
ALTER TABLE "autograde_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "autograde_usage" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text,
	"model" text NOT NULL,
	"input_tokens" integer NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer NOT NULL,
	"batch" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "autograde_usage" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "class_activities" (
	"class_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"position" integer NOT NULL,
	"due_at" text,
	"solution_shared" boolean DEFAULT false NOT NULL,
	CONSTRAINT "class_activities_class_id_activity_id_pk" PRIMARY KEY("class_id","activity_id")
);
--> statement-breakpoint
ALTER TABLE "class_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "class_students" (
	"class_id" text NOT NULL,
	"student_email" text NOT NULL,
	CONSTRAINT "class_students_class_id_student_email_pk" PRIMARY KEY("class_id","student_email")
);
--> statement-breakpoint
ALTER TABLE "class_students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "classes" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"name" text NOT NULL,
	"level" text NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "classes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "deadline_extensions" (
	"student_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"due_at" text NOT NULL,
	"granted_by" text,
	"created_at" text NOT NULL,
	CONSTRAINT "deadline_extensions_student_id_activity_id_pk" PRIMARY KEY("student_id","activity_id")
);
--> statement-breakpoint
ALTER TABLE "deadline_extensions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "late_notices" (
	"id" text PRIMARY KEY NOT NULL,
	"teacher_id" text NOT NULL,
	"progress_id" text NOT NULL,
	"kind" text NOT NULL,
	"due_at" text NOT NULL,
	"created_at" text NOT NULL,
	"seen_at" text
);
--> statement-breakpoint
ALTER TABLE "late_notices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "level_activities" (
	"level" text NOT NULL,
	"activity_id" text NOT NULL,
	"position" integer NOT NULL,
	"section" text DEFAULT 'defis' NOT NULL,
	CONSTRAINT "level_activities_level_activity_id_pk" PRIMARY KEY("level","activity_id")
);
--> statement-breakpoint
ALTER TABLE "level_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "login_attempts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "progress" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"project_path" text,
	"updated_at" text NOT NULL,
	"submitted_at" text,
	"validated_at" text,
	"auto_submitted_at" text,
	"closed_due_at" text
);
--> statement-breakpoint
ALTER TABLE "progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" text PRIMARY KEY NOT NULL,
	"progress_id" text NOT NULL,
	"teacher_id" text NOT NULL,
	"decision" text NOT NULL,
	"comment" text,
	"created_at" text NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"verified_by" text
);
--> statement-breakpoint
ALTER TABLE "reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "students" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"password_reset_by" text,
	"password_reset_at" text,
	"created_at" text NOT NULL,
	"last_login_at" text,
	CONSTRAINT "students_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "students" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teacher_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"email" text NOT NULL,
	"first_name" text,
	"last_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" text NOT NULL,
	"processed_at" text
);
--> statement-breakpoint
ALTER TABLE "teacher_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "teachers" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"must_change_password" boolean DEFAULT true NOT NULL,
	"created_at" text NOT NULL,
	"last_login_at" text,
	CONSTRAINT "teachers_email_unique" UNIQUE("email"),
	CONSTRAINT "teachers_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "teachers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "theme_activities" (
	"theme_id" text NOT NULL,
	"activity_id" text NOT NULL,
	"position" integer NOT NULL,
	"step" text NOT NULL,
	"difficulty" integer NOT NULL,
	"why" text DEFAULT '' NOT NULL,
	CONSTRAINT "theme_activities_theme_id_activity_id_pk" PRIMARY KEY("theme_id","activity_id")
);
--> statement-breakpoint
ALTER TABLE "theme_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "themes" (
	"id" text PRIMARY KEY NOT NULL,
	"level" text NOT NULL,
	"position" integer NOT NULL,
	"title" text NOT NULL,
	"programme" text DEFAULT '' NOT NULL,
	"intro" text DEFAULT '' NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"created_at" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "themes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_autograde" ADD CONSTRAINT "activity_autograde_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_help_videos" ADD CONSTRAINT "activity_help_videos_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autograde_jobs" ADD CONSTRAINT "autograde_jobs_progress_id_progress_id_fk" FOREIGN KEY ("progress_id") REFERENCES "public"."progress"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autograde_jobs" ADD CONSTRAINT "autograde_jobs_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autograde_jobs" ADD CONSTRAINT "autograde_jobs_run_id_autograde_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."autograde_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autograde_runs" ADD CONSTRAINT "autograde_runs_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autograde_runs" ADD CONSTRAINT "autograde_runs_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autograde_usage" ADD CONSTRAINT "autograde_usage_job_id_autograde_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."autograde_jobs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_activities" ADD CONSTRAINT "class_activities_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "class_students" ADD CONSTRAINT "class_students_class_id_classes_id_fk" FOREIGN KEY ("class_id") REFERENCES "public"."classes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "classes" ADD CONSTRAINT "classes_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_extensions" ADD CONSTRAINT "deadline_extensions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_extensions" ADD CONSTRAINT "deadline_extensions_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deadline_extensions" ADD CONSTRAINT "deadline_extensions_granted_by_teachers_id_fk" FOREIGN KEY ("granted_by") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_notices" ADD CONSTRAINT "late_notices_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "late_notices" ADD CONSTRAINT "late_notices_progress_id_progress_id_fk" FOREIGN KEY ("progress_id") REFERENCES "public"."progress"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "level_activities" ADD CONSTRAINT "level_activities_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "progress" ADD CONSTRAINT "progress_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_progress_id_progress_id_fk" FOREIGN KEY ("progress_id") REFERENCES "public"."progress"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_teacher_id_teachers_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."teachers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_verified_by_teachers_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_password_reset_by_teachers_id_fk" FOREIGN KEY ("password_reset_by") REFERENCES "public"."teachers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_activities" ADD CONSTRAINT "theme_activities_theme_id_themes_id_fk" FOREIGN KEY ("theme_id") REFERENCES "public"."themes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "theme_activities" ADD CONSTRAINT "theme_activities_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "autograde_jobs_one_active" ON "autograde_jobs" USING btree ("progress_id") WHERE status in ('queued', 'running', 'waiting_ai');--> statement-breakpoint
CREATE UNIQUE INDEX "late_notices_once" ON "late_notices" USING btree ("teacher_id","progress_id","due_at");--> statement-breakpoint
CREATE INDEX "login_attempts_key_at" ON "login_attempts" USING btree ("key","at");--> statement-breakpoint
CREATE UNIQUE INDEX "progress_student_activity" ON "progress" USING btree ("student_id","activity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_requests_one_pending" ON "teacher_requests" USING btree ("type","email") WHERE status = 'pending';