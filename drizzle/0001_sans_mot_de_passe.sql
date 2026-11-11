ALTER TABLE "students" DROP CONSTRAINT "students_password_reset_by_teachers_id_fk";
--> statement-breakpoint
DROP INDEX "teacher_requests_one_pending";--> statement-breakpoint
-- Ajouté à la main : les demandes de réinitialisation de mot de passe disparaissent avant la colonne `type`, et avant
-- le nouvel index (une demande d'inscription et une de réinitialisation en attente pour la même adresse le bloqueraient).
DELETE FROM "teacher_requests" WHERE "type" = 'reset';--> statement-breakpoint
CREATE UNIQUE INDEX "teacher_requests_one_pending" ON "teacher_requests" USING btree (lower(split_part("email", '@', 1))) WHERE status = 'pending';--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "must_change_password";--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "password_reset_by";--> statement-breakpoint
ALTER TABLE "students" DROP COLUMN "password_reset_at";--> statement-breakpoint
ALTER TABLE "teacher_requests" DROP COLUMN "type";--> statement-breakpoint
ALTER TABLE "teachers" DROP COLUMN "password_hash";--> statement-breakpoint
ALTER TABLE "teachers" DROP COLUMN "must_change_password";