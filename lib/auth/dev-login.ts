import { asc, eq } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { students, teachers } from '@/lib/db/schema'

/**
 * Connexion de développement (choisir un compte existant, sans Google) : seulement en local, sans identifiant Google
 * configuré. Jamais en production ni sur Vercel, quelles que soient les autres variables.
 */
export function devLoginEnabled(): boolean {
  return !process.env.GOOGLE_CLIENT_ID && process.env.NODE_ENV !== 'production' && !process.env.VERCEL
}

export type DevAccount = { id: string; label: string; detail: string }

export async function listDevStudents(db: DB): Promise<DevAccount[]> {
  return (await db.select({ id: students.id, email: students.email, firstName: students.firstName, lastName: students.lastName })
    .from(students).orderBy(asc(students.lastName), asc(students.firstName)))
    .map((s) => ({ id: s.id, label: `${s.firstName} ${s.lastName}`, detail: s.email }))
}

/** Enseignants actifs seulement (un compte désactivé n'ouvrirait aucune page). */
export async function listDevTeachers(db: DB): Promise<DevAccount[]> {
  return (await db.select({ id: teachers.id, email: teachers.email, firstName: teachers.firstName, lastName: teachers.lastName, role: teachers.role })
    .from(teachers).where(eq(teachers.isActive, true)).orderBy(asc(teachers.lastName), asc(teachers.firstName)))
    .map((t) => ({ id: t.id, label: `${t.firstName} ${t.lastName}${t.role === 'admin' ? ' (admin)' : ''}`, detail: t.email }))
}
