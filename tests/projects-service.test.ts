import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'
import { testDb } from './helpers/db'
import { createStudent } from '@/lib/db/students'
import { setActivityStatus, setStarter, upsertBreizhActivity } from '@/lib/db/activities'
import { addAssignments, removeAssignment, setAssignmentDue } from '@/lib/db/assignments'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { getProgress } from '@/lib/db/progress'
import { createTeacher } from '@/lib/db/teachers'
import { GRACE_MS } from '@/lib/deadlines/close'
import { DEADLINE_PASSED, finishAtDeadline, loadProject, openActivityFor, restartDefi, saveProject, submitDefi } from '@/lib/projects/service'
import { readStored, writeStored } from '@/lib/storage/files'
import { progress } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

const sb3 = new Uint8Array(fs.readFileSync('tests/fixtures/defi1-capytale.sb3'))
const sb2 = new Uint8Array(fs.readFileSync('tests/fixtures/le-serpent.sb2'))
const blank = new Uint8Array(fs.readFileSync('scratch-editor/blank.sb3'))

beforeEach(() => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'projets-'))
})

async function setup(opts: { published?: boolean; given?: boolean } = {}) {
  const db = await testDb()
  const student = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org', passwordHash: 'h' })
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
  const a = await upsertBreizhActivity(db, { sourceRef: 3, title: 'Le serpent', slug: 'le-serpent', statementYoutubeId: null, thumbnail: null })
  await setActivityStatus(db, a.id, 'published')
  const cls = await createClass(db, prof.id, { name: '6e A', level: '6' })
  await addEmailsToClass(db, cls.id, [student.email])
  if (opts.given !== false) await addAssignments(db, cls.id, [a.id])
  if (opts.published === false) await setActivityStatus(db, a.id, 'draft')
  return { db, student, activityId: a.id, classId: cls.id }
}

const ago = (ms: number) => new Date(Date.now() - ms).toISOString()

describe('service des projets', () => {
  it('charge le projet vierge, puis le projet de départ, puis le travail de l’élève', async () => {
    const { db, student, activityId } = await setup()
    expect(await loadProject(db, student, activityId)).toMatchObject({ ok: true, source: 'vierge', bytes: blank })
    await writeStored(`starters/${activityId}.sb2`, sb2)
    await setStarter(db, activityId, `starters/${activityId}.sb2`, 'breizh')
    expect(await loadProject(db, student, activityId)).toMatchObject({ ok: true, source: 'depart' })
    expect(await saveProject(db, student, activityId, sb3)).toMatchObject({ ok: true })
    const loaded = await loadProject(db, student, activityId)
    expect(loaded).toMatchObject({ ok: true, source: 'eleve' })
    expect(loaded.ok && loaded.bytes.length).toBe(sb3.length)
    expect((await getProgress(db, student.id, activityId))?.status).toBe('in_progress')
  })

  it('404 pour un défi non publié, non donné à sa classe ou un identifiant forgé', async () => {
    const draft = await setup({ published: false })
    expect(await loadProject(draft.db, draft.student, draft.activityId)).toMatchObject({ ok: false, status: 404 })
    const other = await setup({ given: false })
    expect(await saveProject(other.db, other.student, other.activityId, sb3)).toMatchObject({ ok: false, status: 404 })
    const { db, student } = await setup()
    expect(await loadProject(db, student, '../../etc/passwd')).toMatchObject({ ok: false, status: 404 })
  })

  it('refuse un fichier qui n’est pas un .sb3 sans rien écrire', async () => {
    const { db, student, activityId } = await setup()
    expect(await saveProject(db, student, activityId, new Uint8Array([1, 2, 3]))).toMatchObject({ ok: false, status: 400 })
    expect(await saveProject(db, student, activityId, sb2)).toMatchObject({ ok: false, status: 400 })
    expect(await readStored(`projets/${student.id}/${activityId}.sb3`)).toBeNull()
    expect(await getProgress(db, student.id, activityId)).toBeNull()
  })

  it('soumettre bloque les sauvegardes suivantes (deuxième onglet)', async () => {
    const { db, student, activityId } = await setup()
    expect(await submitDefi(db, student, activityId)).toMatchObject({ ok: false, status: 409 })
    await saveProject(db, student, activityId, sb3)
    expect(await submitDefi(db, student, activityId)).toEqual({ ok: true })
    expect(await saveProject(db, student, activityId, sb3)).toMatchObject({ ok: false, status: 409 })
    expect(await restartDefi(db, student, activityId)).toMatchObject({ ok: false, status: 409 })
  })

  it('recommencer supprime le travail et revient au projet de départ', async () => {
    const { db, student, activityId } = await setup()
    await writeStored(`starters/${activityId}.sb2`, sb2)
    await setStarter(db, activityId, `starters/${activityId}.sb2`, 'breizh')
    await saveProject(db, student, activityId, sb3)
    const savedPath = (await getProgress(db, student.id, activityId))!.projectPath!
    expect(await restartDefi(db, student, activityId)).toEqual({ ok: true })
    expect(await readStored(savedPath)).toBeNull()
    expect(await loadProject(db, student, activityId)).toMatchObject({ ok: true, source: 'depart' })
  })

  it("une sauvegarde concurrente d'un envoi ne remplace jamais le fichier envoyé au professeur", async () => {
    const { db, student, activityId } = await setup()
    await saveProject(db, student, activityId, sb3)
    const [save] = await Promise.all([saveProject(db, student, activityId, blank), submitDefi(db, student, activityId)])
    const p = (await getProgress(db, student.id, activityId))!
    expect(p.status).toBe('submitted')
    expect(save).toMatchObject({ ok: false, status: 409 })
    expect((await readStored(p.projectPath!))!.length).toBe(sb3.length) // le fichier envoyé est intact
    const files = fs.readdirSync(path.join(process.env.STORAGE_DIR!, 'projets', student.id))
    expect(files).toHaveLength(1) // le fichier de la sauvegarde refusée a été supprimé
  })

  it('n’ouvre plus un défi retiré de la classe ; le travail reste en base', async () => {
    const { db, student, activityId, classId } = await setup()
    await saveProject(db, student, activityId, sb3)
    expect(await openActivityFor(db, student, activityId)).not.toBeNull()
    await removeAssignment(db, classId, activityId)
    expect(await openActivityFor(db, student, activityId)).toBeNull()
    expect(await saveProject(db, student, activityId, sb3)).toMatchObject({ ok: false, status: 404 })
    expect((await getProgress(db, student.id, activityId))?.projectPath).not.toBeNull()
  })

  it('refuse l’envoi après l’échéance', async () => {
    const { db, student, activityId, classId } = await setup()
    await saveProject(db, student, activityId, sb3)
    await setAssignmentDue(db, classId, activityId, ago(1000))
    expect(await submitDefi(db, student, activityId)).toMatchObject({ ok: false, status: 409, error: DEADLINE_PASSED })
  })

  it('accepte une sauvegarde pendant la marge, la refuse après le rendu automatique', async () => {
    const { db, student, activityId, classId } = await setup()
    await saveProject(db, student, activityId, sb3)
    await setAssignmentDue(db, classId, activityId, ago(30_000))
    expect(await saveProject(db, student, activityId, sb3)).toMatchObject({ ok: true })
    await setAssignmentDue(db, classId, activityId, ago(GRACE_MS + 1000))
    expect(await saveProject(db, student, activityId, sb3)).toMatchObject({ ok: false, status: 409 })
    expect((await getProgress(db, student.id, activityId))?.status).toBe('submitted')
  })

  it('reconfirmer le fichier déjà enregistré (envoi direct rejoué) : succès sans rien réécrire ni supprimer', async () => {
    const { db, student, activityId } = await setup()
    const rel = `projets/${student.id}/${activityId}-1-abc.sb3`
    await writeStored(rel, sb3)
    expect(await saveProject(db, student, activityId, sb3, rel)).toMatchObject({ ok: true })
    const old = ago(60_000)
    await db.update(progress).set({ updatedAt: old }).where(eq(progress.studentId, student.id))
    expect(await saveProject(db, student, activityId, sb3, rel)).toMatchObject({ ok: true })
    expect(await getProgress(db, student.id, activityId)).toMatchObject({ projectPath: rel, updatedAt: old })
    expect(await readStored(rel)).not.toBeNull()
  })

  it('termine le défi à l’heure exacte à la demande du navigateur', async () => {
    const { db, student, activityId, classId } = await setup()
    await saveProject(db, student, activityId, sb3)
    await setAssignmentDue(db, classId, activityId, new Date(Date.now() + 60_000).toISOString())
    expect(await finishAtDeadline(db, student, activityId)).toMatchObject({ ok: false, status: 409 })
    await setAssignmentDue(db, classId, activityId, ago(1000))
    expect(await finishAtDeadline(db, student, activityId)).toEqual({ ok: true })
    expect((await getProgress(db, student.id, activityId))?.status).toBe('submitted')
  })
})
