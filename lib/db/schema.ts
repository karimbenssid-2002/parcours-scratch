import { sql } from 'drizzle-orm'
import { boolean, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, type AnyPgColumn } from 'drizzle-orm/pg-core'
import { LEVELS } from '@/lib/levels'

const id = () => text('id').primaryKey().$defaultFn(() => crypto.randomUUID())
const nowIso = (name: string) => text(name).notNull().$defaultFn(() => new Date().toISOString())

export const PROGRESS_STATUSES = ['not_started', 'in_progress', 'submitted', 'validated', 'almost', 'needs_work', 'not_submitted'] as const
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number]
export const REVIEW_DECISIONS = ['validated', 'almost', 'needs_work'] as const
export type ReviewDecision = (typeof REVIEW_DECISIONS)[number]

/* Chaque table active la RLS (`.enableRLS()`), sans aucune politique : l'appli se connecte en propriétaire des tables,
 * qui n'y est pas soumis, alors que la Data API de Supabase (clé publique, rôles anon/authenticated) n'y voit rien.
 * Une nouvelle table doit faire de même (tests/db/schema.test.ts le vérifie). */
export const teachers = pgTable('teachers', {
  id: id(),
  email: text('email').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  username: text('username').notNull().unique(),
  role: text('role', { enum: ['admin', 'prof'] }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: nowIso('created_at'),
  lastLoginAt: text('last_login_at'),
}).enableRLS()

/** Identité d'un enseignant en SQL : partie avant le @ de l'adresse, en minuscules (même règle que teacherIdentity). */
export const emailIdentity = (email: AnyPgColumn) => sql`lower(split_part(${email}, '@', 1))`

export const teacherRequests = pgTable('teacher_requests', {
  id: id(),
  email: text('email').notNull(),
  firstName: text('first_name'),
  lastName: text('last_name'),
  status: text('status', { enum: ['pending', 'approved', 'rejected'] }).notNull().default('pending'),
  createdAt: nowIso('created_at'),
  processedAt: text('processed_at'),
}, (t) => [
  // Une seule demande en attente par identité (prenom.nom, quel que soit le domaine), même si deux envois arrivent ensemble.
  uniqueIndex('teacher_requests_one_pending').on(emailIdentity(t.email)).where(sql`status = 'pending'`),
]).enableRLS()

export const students = pgTable('students', {
  id: id(),
  email: text('email').notNull().unique(),
  firstName: text('first_name').notNull(),
  lastName: text('last_name').notNull(),
  createdAt: nowIso('created_at'),
  lastLoginAt: text('last_login_at'),
}).enableRLS()

export const classes = pgTable('classes', {
  id: id(),
  teacherId: text('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  level: text('level', { enum: LEVELS }).notNull(),
  createdAt: nowIso('created_at'),
}).enableRLS()

export const classStudents = pgTable(
  'class_students',
  {
    classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    studentEmail: text('student_email').notNull(),
  },
  (t) => [primaryKey({ columns: [t.classId, t.studentEmail] })],
).enableRLS()

export const activities = pgTable('activities', {
  id: id(),
  title: text('title').notNull(),
  slug: text('slug').notNull().unique(),
  capytaleUrl: text('capytale_url'),
  capytaleNid: text('capytale_nid'),
  starterProjectPath: text('starter_project_path'),
  starterSource: text('starter_source', { enum: ['upload', 'capytale', 'breizh'] }),
  statementYoutubeId: text('statement_youtube_id'),
  instructions: text('instructions'),
  thumbnail: text('thumbnail'),
  status: text('status', { enum: ['draft', 'published'] }).notNull().default('draft'),
  source: text('source', { enum: ['breizh', 'admin'] }).notNull().default('admin'),
  sourceRef: integer('source_ref').unique(),
  createdAt: nowIso('created_at'),
  updatedAt: nowIso('updated_at'),
}).enableRLS()

export const activityHelpVideos = pgTable('activity_help_videos', {
  id: id(),
  activityId: text('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  youtubeId: text('youtube_id').notNull(),
  position: integer('position').notNull(),
}).enableRLS()

export const levelActivities = pgTable(
  'level_activities',
  {
    level: text('level', { enum: LEVELS }).notNull(),
    activityId: text('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    section: text('section', { enum: ['defis', 'mini-projet'] }).notNull().default('defis'),
  },
  (t) => [primaryKey({ columns: [t.level, t.activityId] })],
).enableRLS()

export const THEME_STEPS = ['decouvrir', 'entrainer', 'approfondir'] as const

/** Progression d'un niveau : thèmes ordonnés proposés aux professeurs (les facultatifs viennent après). */
export const themes = pgTable('themes', {
  id: id(),
  level: text('level', { enum: LEVELS }).notNull(),
  position: integer('position').notNull(),
  title: text('title').notNull(),
  programme: text('programme').notNull().default(''),
  intro: text('intro').notNull().default(''),
  optional: boolean('optional').notNull().default(false),
  createdAt: nowIso('created_at'),
}).enableRLS()

/** Défis d'un thème ; étape, difficulté et « Pourquoi ici » appartiennent au défi dans ce thème. */
export const themeActivities = pgTable(
  'theme_activities',
  {
    themeId: text('theme_id').notNull().references(() => themes.id, { onDelete: 'cascade' }),
    activityId: text('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    step: text('step', { enum: THEME_STEPS }).notNull(),
    difficulty: integer('difficulty').notNull(),
    why: text('why').notNull().default(''),
  },
  (t) => [primaryKey({ columns: [t.themeId, t.activityId] })],
).enableRLS()

/** Défis donnés à une classe par son professeur : c'est ce que voient les élèves. */
export const classActivities = pgTable(
  'class_activities',
  {
    classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
    activityId: text('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }),
    position: integer('position').notNull(),
    dueAt: text('due_at'), // échéance UTC ISO ; null = pas de date limite
    solutionShared: boolean('solution_shared').notNull().default(false), // corrigé visible des élèves
  },
  (t) => [primaryKey({ columns: [t.classId, t.activityId] })],
).enableRLS()

/** Délai accordé à un élève pour un défi : remplace l'échéance de ses classes. */
export const deadlineExtensions = pgTable(
  'deadline_extensions',
  {
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    activityId: text('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }),
    dueAt: text('due_at').notNull(),
    grantedBy: text('granted_by').references(() => teachers.id, { onDelete: 'set null' }),
    createdAt: nowIso('created_at'),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.activityId] })],
).enableRLS()

export const progress = pgTable(
  'progress',
  {
    id: id(),
    studentId: text('student_id').notNull().references(() => students.id, { onDelete: 'cascade' }),
    activityId: text('activity_id').notNull().references(() => activities.id, { onDelete: 'cascade' }),
    status: text('status', { enum: PROGRESS_STATUSES }).notNull().default('not_started'),
    projectPath: text('project_path'),
    updatedAt: nowIso('updated_at'),
    submittedAt: text('submitted_at'),
    validatedAt: text('validated_at'),
    // Rendu automatique à l'échéance (null sinon).
    autoSubmittedAt: text('auto_submitted_at'),
    // Dernière échéance traitée par closeOverdue : un rendu automatique n'a lieu qu'une fois par échéance.
    closedDueAt: text('closed_due_at'),
  },
  (t) => [uniqueIndex('progress_student_activity').on(t.studentId, t.activityId)],
).enableRLS()

export const reviews = pgTable('reviews', {
  id: id(),
  progressId: text('progress_id').notNull().references(() => progress.id, { onDelete: 'cascade' }),
  teacherId: text('teacher_id').notNull().references(() => teachers.id),
  decision: text('decision', { enum: REVIEW_DECISIONS }).notNull(),
  comment: text('comment'),
  createdAt: nowIso('created_at'),
  // Décision issue d'une correction automatique (jamais montré à l'élève) ; professeur qui l'a vérifiée, le cas échéant.
  automatic: boolean('automatic').notNull().default(false),
  verifiedBy: text('verified_by').references(() => teachers.id, { onDelete: 'set null' }),
}).enableRLS()

/** Alertes « travail non rendu à temps » pour le professeur. */
export const lateNotices = pgTable(
  'late_notices',
  {
    id: id(),
    teacherId: text('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
    progressId: text('progress_id').notNull().references(() => progress.id, { onDelete: 'cascade' }),
    kind: text('kind', { enum: ['auto_submitted', 'not_submitted'] }).notNull(),
    dueAt: text('due_at').notNull(),
    createdAt: nowIso('created_at'),
    seenAt: text('seen_at'),
  },
  (t) => [uniqueIndex('late_notices_once').on(t.teacherId, t.progressId, t.dueAt)],
).enableRLS()

// Correction automatique (plan 6)
export const activityAutograde = pgTable('activity_autograde', {
  activityId: text('activity_id').primaryKey().references(() => activities.id, { onDelete: 'cascade' }),
  solutionPath: text('solution_path'),
  solutionFormat: text('solution_format', { enum: ['sb3', 'sb2'] }),
  criteria: text('criteria').notNull().default('[]'), // JSON string[]
  answers: text('answers').notNull().default('[]'),
  keys: text('keys').notNull().default('[]'),
  durationMs: integer('duration_ms').notNull().default(10_000),
  updatedAt: nowIso('updated_at'),
}).enableRLS()

export const AUTOGRADE_JOB_STATUSES = ['queued', 'running', 'waiting_ai', 'done', 'failed', 'stale', 'applied'] as const
/** Correction en cours : au plus une par défi (index unique partiel ci-dessous). */
export const ACTIVE_JOB_STATUSES = ['queued', 'running', 'waiting_ai'] as const satisfies readonly (typeof AUTOGRADE_JOB_STATUSES)[number][]
export const autogradeRuns = pgTable('autograde_runs', {
  id: id(),
  classId: text('class_id').notNull().references(() => classes.id, { onDelete: 'cascade' }),
  teacherId: text('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
  mode: text('mode', { enum: ['propose', 'send'] }).notNull(),
  batchId: text('batch_id'),
  createdAt: nowIso('created_at'),
  finishedAt: text('finished_at'),
}).enableRLS()
export const autogradeJobs = pgTable('autograde_jobs', {
  id: id(),
  progressId: text('progress_id').notNull().references(() => progress.id, { onDelete: 'cascade' }),
  teacherId: text('teacher_id').notNull().references(() => teachers.id, { onDelete: 'cascade' }),
  runId: text('run_id').references(() => autogradeRuns.id, { onDelete: 'set null' }),
  mode: text('mode', { enum: ['propose', 'send'] }).notNull(),
  status: text('status', { enum: AUTOGRADE_JOB_STATUSES }).notNull().default('queued'),
  submittedAt: text('submitted_at').notNull(),
  prepared: text('prepared'), // JSON du message IA préparé (en attente du lot) — sans donnée personnelle
  result: text('result'),     // JSON Proposal
  error: text('error'),
  createdAt: nowIso('created_at'),
  startedAt: text('started_at'),
  finishedAt: text('finished_at'),
  attempts: integer('attempts').notNull().default(0), // tentatives d'exécution (file de corrections)
}, (t) => [
  // Deux demandes simultanées (double clic, deux onglets) ne peuvent pas lancer deux corrections du même défi.
  uniqueIndex('autograde_jobs_one_active').on(t.progressId)
    .where(sql.raw(`status in (${ACTIVE_JOB_STATUSES.map((s) => `'${s}'`).join(', ')})`)),
]).enableRLS()
export const autogradeUsage = pgTable('autograde_usage', {
  id: id(),
  jobId: text('job_id').references(() => autogradeJobs.id, { onDelete: 'set null' }),
  model: text('model').notNull(),
  inputTokens: integer('input_tokens').notNull(),
  cacheReadTokens: integer('cache_read_tokens').notNull().default(0),
  cacheWriteTokens: integer('cache_write_tokens').notNull().default(0),
  outputTokens: integer('output_tokens').notNull(),
  batch: boolean('batch').notNull().default(false),
  createdAt: nowIso('created_at'),
}).enableRLS()
/** Relevés de la solution et du projet de départ d'une activité : toujours identiques (graines fixes, temps simulé), donc gardés. */
export const autogradeReferenceRuns = pgTable('autograde_reference_runs', {
  key: text('key').primaryKey(), // SHA-256 du fichier + réglages + graines
  result: text('result').notNull(), // JSON RunResult (jamais le projet lui-même)
  createdAt: nowIso('created_at'),
}).enableRLS()
/** Chaque exécution envoyée au service d'exécution (plafond mensuel : on compte kind = 'eleve'). */
export const autogradeRunnerCalls = pgTable('autograde_runner_calls', {
  id: id(),
  at: nowIso('at'),
  jobId: text('job_id').references(() => autogradeJobs.id, { onDelete: 'set null' }),
  durationMs: integer('duration_ms').notNull(),
  kind: text('kind', { enum: ['eleve', 'reference', 'test'] }).notNull(),
}).enableRLS()
export const appSettings = pgTable('app_settings', { key: text('key').primaryKey(), value: text('value').notNull() }).enableRLS()
/** Tentatives récentes (connexion, inscription, demandes) : en base, car chaque requête peut tomber sur une instance différente. */
export const loginAttempts = pgTable('login_attempts', {
  id: id(),
  key: text('key').notNull(),
  at: timestamp('at', { withTimezone: true }).notNull(),
}, (t) => [index('login_attempts_key_at').on(t.key, t.at)]).enableRLS()
