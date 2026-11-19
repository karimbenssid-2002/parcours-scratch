import { and, eq, sql } from 'drizzle-orm'
import type { DB } from '@/lib/db/client'
import { normalizeEmail } from '@/lib/auth/validation'
import { serverErrorDetail } from '@/lib/auth/google-flow'
import { getSetting, setSetting } from '@/lib/db/autograde'
import { classes, classStudents, loginAttempts, pushSubscriptions, students } from '@/lib/db/schema'
import { deleteStoredPrefix, listStoredFolders } from '@/lib/storage/files'
import { resetYearFor } from '@/lib/retention/calendar'

/**
 * Efface un élève et toutes ses données : abonnements aux notifications (sans clé étrangère), adresse dans les
 * listes de classe (sans tenir compte des majuscules, comme isEmailInAnyClass), puis le compte (progressions,
 * retours, alertes, délais partent en cascade) ; enfin son dossier de fichiers. Les fichiers ne sont effacés
 * qu'après la validation de la base (on ne peut pas les restaurer). Si leur suppression échoue, l'erreur est
 * journalisée (sans donnée personnelle) et `filesPending: true` : le dossier, désormais sans élève, est effacé par
 * le passage quotidien de deleteOrphanFolders (tâche planifiée « veille »). Une erreur de la base remonte (rien
 * n'est effacé).
 */
export async function eraseStudent(db: DB, studentId: string): Promise<{ found: boolean; files: number; filesPending: boolean }> {
  const found = await db.transaction(async (tx) => {
    const [s] = await tx.select({ email: students.email }).from(students).where(eq(students.id, studentId)).limit(1)
    if (!s) return false
    await tx.delete(pushSubscriptions).where(and(eq(pushSubscriptions.ownerKind, 'student'), eq(pushSubscriptions.ownerId, studentId)))
    await tx.delete(classStudents).where(eq(sql`lower(${classStudents.studentEmail})`, normalizeEmail(s.email)))
    await tx.delete(students).where(eq(students.id, studentId))
    return true
  })
  if (!found) return { found: false, files: 0, filesPending: false }
  try {
    const { deleted } = await deleteStoredPrefix(`projets/${studentId}/`)
    return { found: true, files: deleted, filesPending: false }
  } catch (e) {
    console.error(`[suppression d’un élève] fichiers non effacés, repris par la tâche quotidienne : ${serverErrorDetail(e)}`)
    return { found: true, files: 0, filesPending: true }
  }
}

export type ResetOutcome =
  | { status: 'initialise' | 'a-jour'; year: number }
  | { status: 'fait' | 'partiel'; year: number; students: number; classes: number; files: number }

/** Repères (année sur 4 chiffres) : remise à zéro terminée (base et fichiers), et base seule remise à zéro. */
const REPERE = 'remise_a_zero_annee'
const REPERE_BASE = 'remise_a_zero_base'
const annee = (v: string | null) => (v !== null && /^\d{4}$/.test(v) ? Number(v) : null)

/**
 * Remise à zéro annuelle (le 31 juillet, heure de Rabat), appelée chaque jour par la tâche planifiée.
 * - Repère `remise_a_zero_annee` absent (ou illisible, signalé dans le journal) : les deux repères sont écrits à
 *   l'année en cours, rien n'est effacé. Le site a ouvert après le 31 juillet 2026 : le premier passage écrit
 *   2026 et la première vraie remise à zéro a lieu le 31 juillet 2027.
 * - Repère à l'année en cours (ou après) : rien.
 * - Base pas encore remise à zéro cette année : une transaction efface tous les élèves (progressions, retours,
 *   alertes, délais, corrections en cascade), toutes les classes (listes, affectations, séries de corrections en
 *   cascade), les abonnements des élèves (sans clé étrangère) et les tentatives de connexion, et écrit
 *   `remise_a_zero_base`. Puis tout le dossier `projets/` (plus aucun élève à ce moment-là).
 * - Base déjà remise à zéro cette année (stockage en panne ou échéance atteinte la veille) : reprise. La base
 *   n'est plus jamais touchée (classes et élèves de la rentrée gardés) ; seuls les dossiers `projets/<id>/` dont
 *   l'élève n'existe plus sont effacés. Un repère `remise_a_zero_base` illisible (ni absent ni une année) vaut
 *   l'année en cours : reprise seule, jamais une seconde remise à zéro de la base ; il est signalé dans le journal
 *   et réécrit à l'année en cours (la remise à zéro de l'année suivante a donc bien lieu).
 * `remise_a_zero_annee` n'est écrit qu'une fois tous les fichiers effacés (`fait`) ; sinon `partiel`, reprise le
 * lendemain. Une erreur du stockage remonte, la base reste validée.
 */
export async function annualReset(db: DB, nowMs: number, opts: { deadlineMs?: number } = {}): Promise<ResetOutcome> {
  const year = resetYearFor(nowMs)
  const brut = await getSetting(db, REPERE)
  const fait = annee(brut)
  if (fait === null) {
    if (brut !== null) console.warn(`[remise à zéro] repère illisible, réécrit à ${year}`)
    await db.transaction(async (tx) => {
      await setSetting(tx, REPERE, String(year))
      await setSetting(tx, REPERE_BASE, String(year))
    })
    return { status: 'initialise', year }
  }
  if (fait >= year) return { status: 'a-jour', year }

  let counts = { students: 0, classes: 0 }
  let deleted = 0
  let complete: boolean
  const brutBase = await getSetting(db, REPERE_BASE)
  let base = annee(brutBase)
  if (base === null && brutBase !== null) {
    console.warn(`[remise à zéro] repère de la base illisible, réécrit à ${year} : reprise seule, la base n’est pas effacée`)
    await setSetting(db, REPERE_BASE, String(year))
    base = year
  }
  if ((base ?? 0) >= year) {
    ;({ deleted, complete } = await deleteOrphanFolders(db, { deadlineMs: opts.deadlineMs }))
  } else {
    counts = await db.transaction(async (tx) => {
      await tx.delete(pushSubscriptions).where(eq(pushSubscriptions.ownerKind, 'student'))
      await tx.delete(loginAttempts)
      const s = await tx.delete(students).returning({ id: students.id })
      const c = await tx.delete(classes).returning({ id: classes.id })
      await setSetting(tx, REPERE_BASE, String(year))
      return { students: s.length, classes: c.length }
    })
    ;({ deleted, complete } = await deleteStoredPrefix('projets/', { deadlineMs: opts.deadlineMs }))
  }
  if (!complete) return { status: 'partiel', year, ...counts, files: deleted }
  await setSetting(db, REPERE, String(year))
  return { status: 'fait', year, ...counts, files: deleted }
}

/**
 * Efface les dossiers `projets/<id>/` sans élève `<id>` : reprise de la remise à zéro annuelle, et passage quotidien
 * de la tâche « veille » (fichiers d'un élève supprimé dont l'effacement a échoué, envoi direct autorisé avant la
 * suppression et arrivé après). Les dossiers sont listés avant les élèves : un dossier listé a été créé par un élève
 * déjà présent en base, donc un élève inscrit entre-temps est épargné. Ne touche ni la base ni les repères. Sans
 * orphelin, le coût est une lecture de liste du stockage par centaine d'élèves et une requête des identifiants.
 */
export async function deleteOrphanFolders(db: DB, opts: { deadlineMs?: number } = {}): Promise<{ deleted: number; complete: boolean }> {
  const { deadlineMs } = opts
  const dossiers = await listStoredFolders('projets/')
  const vivants = new Set((await db.select({ id: students.id }).from(students)).map((s) => s.id))
  let deleted = 0
  for (const id of dossiers) {
    if (vivants.has(id)) continue
    if (deadlineMs !== undefined && Date.now() > deadlineMs) return { deleted, complete: false }
    const r = await deleteStoredPrefix(`projets/${id}/`, { deadlineMs })
    deleted += r.deleted
    if (!r.complete) return { deleted, complete: false }
  }
  return { deleted, complete: true }
}
