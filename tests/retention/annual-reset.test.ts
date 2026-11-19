import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { createActivity, setActivityStatus } from '@/lib/db/activities'
import { addAssignments } from '@/lib/db/assignments'
import { getSetting, setSetting } from '@/lib/db/autograde'
import {
  activities, appSettings, autogradeRunnerCalls, autogradeUsage, classActivities, classes, classStudents, loginAttempts,
  progress, pushSubscriptions, reviews, students, teachers, themes,
} from '@/lib/db/schema'
import { writeStored } from '@/lib/storage/files'
import { setBucketForTests } from '@/lib/storage/supabase'
import { annualReset, deleteOrphanFolders } from '@/lib/retention/erase'
import { bucketAvecEtat } from '../helpers/fake-bucket'

let dir: string
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'remise-'))
  process.env.STORAGE_DIR = dir
})
afterEach(() => {
  delete process.env.STORAGE_DIR
  delete process.env.STORAGE_BACKEND
  setBucketForTests(null)
  fs.rmSync(dir, { recursive: true, force: true })
})

type TestDb = Awaited<ReturnType<typeof testDb>>
const ms = (iso: string) => Date.parse(iso)
const bytes = new Uint8Array([1, 2, 3])
const existe = (rel: string) => fs.existsSync(path.join(dir, ...rel.split('/')))
const repere = (db: TestDb) => getSetting(db, 'remise_a_zero_annee')
const repereBase = (db: TestDb) => getSetting(db, 'remise_a_zero_base')

/** Un enseignant, une activité publiée, un thème, une classe (activité affectée), deux élèves avec du travail. */
async function setup() {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
  const { id: a } = await createActivity(db, { title: 'Le serpent' })
  await setActivityStatus(db, a, 'published')
  await db.insert(themes).values({ level: '6', position: 1, title: 'Premiers pas' })
  const c = await createClass(db, prof.id, { name: '6e A', level: '6' })
  await addAssignments(db, c.id, [a])
  const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
  const bob = await createStudent(db, { email: 'bob.exemple@malraux-rabat.org' })
  await addEmailsToClass(db, c.id, [alice.email, bob.email])
  for (const s of [alice, bob]) {
    const [p] = await db.insert(progress).values({ studentId: s.id, activityId: a, status: 'submitted', projectPath: `projets/${s.id}/a.sb3` }).returning()
    await db.insert(reviews).values({ progressId: p.id, teacherId: prof.id, decision: 'validated' })
    await db.insert(pushSubscriptions).values({ ownerKind: 'student', ownerId: s.id, endpoint: 'https://push.test/s', p256dh: 'k', auth: 'a' })
  }
  await db.insert(pushSubscriptions).values({ ownerKind: 'teacher', ownerId: prof.id, endpoint: 'https://push.test/t', p256dh: 'k', auth: 'a' })
  await db.insert(loginAttempts).values([{ key: 'connexion:1', at: new Date() }, { key: 'inscription:2', at: new Date() }])
  await setSetting(db, 'autograde_monthly_cap', '20')
  await writeStored(`projets/${alice.id}/a.sb3`, bytes)
  await writeStored(`projets/${bob.id}/a.sb3`, bytes)
  await writeStored(`projets/${bob.id}/abandon.sb3`, bytes)
  await writeStored('starters/x.sb3', bytes)
  return { db, prof, a, c, alice, bob }
}

describe('annualReset', () => {
  it('sans repère : initialise l’année et n’efface rien', async () => {
    const { db, alice } = await setup()
    expect(await annualReset(db, ms('2026-11-19T05:00:00Z'))).toEqual({ status: 'initialise', year: 2026 })
    expect(await repere(db)).toBe('2026')
    expect(await repereBase(db)).toBe('2026')
    expect(await db.select().from(students)).toHaveLength(2)
    expect(await db.select().from(classes)).toHaveLength(1)
    expect(await db.select().from(progress)).toHaveLength(2)
    expect(await db.select().from(loginAttempts)).toHaveLength(2)
    expect(existe(`projets/${alice.id}/a.sb3`)).toBe(true)
  })

  it('repère illisible : signalé, traité comme absent, rien n’est effacé', async () => {
    const { db } = await setup()
    await setSetting(db, 'remise_a_zero_annee', 'abc')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await annualReset(db, ms('2027-07-31T05:00:00Z'))).toEqual({ status: 'initialise', year: 2027 })
      expect(warn).toHaveBeenCalledWith('[remise à zéro] repère illisible, réécrit à 2027')
    } finally {
      warn.mockRestore()
    }
    expect(await repere(db)).toBe('2027')
    expect(await repereBase(db)).toBe('2027')
    expect(await db.select().from(students)).toHaveLength(2)
  })

  it('repère de la base illisible : reprise seule (jamais une seconde remise à zéro), signalé, réécrit', async () => {
    const { db, alice, bob } = await setup()
    await setSetting(db, 'remise_a_zero_annee', '2026')
    await setSetting(db, 'remise_a_zero_base', '20x7')
    await db.delete(students).where(eq(students.id, alice.id)) // alice disparue : son dossier est orphelin
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      expect(await annualReset(db, ms('2027-07-31T05:00:00Z')))
        .toEqual({ status: 'fait', year: 2027, students: 0, classes: 0, files: 1 })
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn).toHaveBeenCalledWith('[remise à zéro] repère de la base illisible, réécrit à 2027 : reprise seule, la base n’est pas effacée')
      expect(String(warn.mock.calls[0][0])).not.toContain('@')
    } finally {
      warn.mockRestore()
    }
    // La base n'est pas effacée : bob, la classe, les tentatives et les abonnements restent.
    expect(await db.select().from(students)).toHaveLength(1)
    expect(await db.select().from(classes)).toHaveLength(1)
    expect(await db.select().from(loginAttempts)).toHaveLength(2)
    expect(existe(`projets/${alice.id}`)).toBe(false)
    expect(existe(`projets/${bob.id}/a.sb3`)).toBe(true)
    expect(await repere(db)).toBe('2027')
    expect(await repereBase(db)).toBe('2027')
    // L'année suivante, le repère réécrit laisse la remise à zéro se faire normalement.
    expect(await annualReset(db, ms('2028-07-31T05:00:00Z'))).toMatchObject({ status: 'fait', year: 2028, students: 1, classes: 1 })
    expect(await db.select().from(students)).toHaveLength(0)
  })

  it('repère à jour : rien', async () => {
    const { db, alice } = await setup()
    await setSetting(db, 'remise_a_zero_annee', '2026')
    expect(await annualReset(db, ms('2027-07-30T05:00:00Z'))).toEqual({ status: 'a-jour', year: 2026 })
    expect(await repere(db)).toBe('2026')
    expect(await db.select().from(students)).toHaveLength(2)
    expect(existe(`projets/${alice.id}/a.sb3`)).toBe(true)
  })

  it('31 juillet : efface élèves, classes, abonnements élèves, tentatives et dossier projets/', async () => {
    const { db } = await setup()
    await setSetting(db, 'remise_a_zero_annee', '2026')
    expect(await annualReset(db, ms('2027-07-31T05:00:00Z'))).toEqual({ status: 'fait', year: 2027, students: 2, classes: 1, files: 3 })
    expect(await repere(db)).toBe('2027')
    expect(await repereBase(db)).toBe('2027')
    expect(await db.select().from(students)).toHaveLength(0)
    expect(await db.select().from(classes)).toHaveLength(0)
    expect(await db.select().from(classStudents)).toHaveLength(0)
    expect(await db.select().from(classActivities)).toHaveLength(0)
    expect(await db.select().from(progress)).toHaveLength(0)
    expect(await db.select().from(reviews)).toHaveLength(0)
    expect(await db.select().from(pushSubscriptions).where(eq(pushSubscriptions.ownerKind, 'student'))).toHaveLength(0)
    expect(await db.select().from(loginAttempts)).toHaveLength(0)
    expect(existe('projets')).toBe(false)
  })

  it('garde enseignants, activités, réglages et abonnements enseignants', async () => {
    const { db, prof } = await setup()
    await setSetting(db, 'remise_a_zero_annee', '2026')
    await annualReset(db, ms('2027-07-31T05:00:00Z'))
    expect(await db.select().from(teachers)).toHaveLength(1)
    expect(await db.select().from(activities)).toHaveLength(1)
    expect(await db.select().from(themes)).toHaveLength(1)
    expect(await getSetting(db, 'autograde_monthly_cap')).toBe('20')
    expect(await db.select().from(appSettings)).toHaveLength(3) // plafond + deux repères
    const subs = await db.select().from(pushSubscriptions)
    expect(subs).toHaveLength(1)
    expect(subs[0]).toMatchObject({ ownerKind: 'teacher', ownerId: prof.id })
    expect(existe('starters/x.sb3')).toBe(true)
  })

  it('garde la consommation de la correction automatique', async () => {
    const { db } = await setup()
    await setSetting(db, 'remise_a_zero_annee', '2026')
    await db.insert(autogradeUsage).values({ model: 'claude-haiku-5-5', inputTokens: 10, outputTokens: 5 })
    await db.insert(autogradeRunnerCalls).values({ durationMs: 1200, kind: 'eleve' })
    expect(await annualReset(db, ms('2027-07-31T05:00:00Z'))).toMatchObject({ status: 'fait' })
    expect(await db.select().from(autogradeUsage)).toHaveLength(1)
    expect(await db.select().from(autogradeRunnerCalls)).toHaveLength(1)
  })

  /**
   * Remise à zéro dont le stockage n'aboutit pas (panne ou échéance), puis rentrée : un enseignant crée une classe,
   * un élève s'inscrit et enregistre un fichier. Le lendemain, la base n'est plus touchée et seuls les dossiers
   * des élèves disparus sont effacés.
   */
  async function rentreeApresIncident(incident: 'panne' | 'echeance') {
    const { db, prof, alice, bob } = await setup()
    await setSetting(db, 'remise_a_zero_annee', '2026')
    process.env.STORAGE_BACKEND = 'supabase'
    const f = bucketAvecEtat([`projets/${alice.id}/a.sb3`, `projets/${bob.id}/a.sb3`, `projets/${bob.id}/b.sb3`, 'starters/x.sb3'])
    setBucketForTests(f.bucket)

    if (incident === 'panne') {
      f.panne.on = true
      await expect(annualReset(db, ms('2027-07-31T05:00:00Z'))).rejects.toThrow('stockage indisponible')
      f.panne.on = false
    } else {
      expect(await annualReset(db, ms('2027-07-31T05:00:00Z'), { deadlineMs: Date.now() - 1 }))
        .toEqual({ status: 'partiel', year: 2027, students: 2, classes: 1, files: 0 })
    }
    // Base validée, stockage non : seul le repère de la base avance.
    expect(await db.select().from(students)).toHaveLength(0)
    expect(await db.select().from(classes)).toHaveLength(0)
    expect(await repere(db)).toBe('2026')
    expect(await repereBase(db)).toBe('2027')
    expect(f.etat.size).toBe(4)

    const c = await createClass(db, prof.id, { name: '5e B', level: '5' })
    const carla = await createStudent(db, { email: 'carla.exemple@malraux-rabat.org' })
    await addEmailsToClass(db, c.id, [carla.email])
    f.etat.add(`projets/${carla.id}/x.sb3`)

    expect(await annualReset(db, ms('2027-09-02T05:00:00Z')))
      .toEqual({ status: 'fait', year: 2027, students: 0, classes: 0, files: 3 })
    expect(await repere(db)).toBe('2027')
    expect(await db.select().from(classes)).toHaveLength(1)
    expect(await db.select().from(students)).toHaveLength(1)
    expect(await db.select().from(classStudents)).toHaveLength(1)
    expect([...f.etat].sort()).toEqual([`projets/${carla.id}/x.sb3`, 'starters/x.sb3'])

    expect(await annualReset(db, ms('2027-09-03T05:00:00Z'))).toEqual({ status: 'a-jour', year: 2027 })
    expect(await db.select().from(students)).toHaveLength(1)
  }

  it('stockage en panne pendant la remise à zéro : la reprise ne touche plus la base ni les nouveaux élèves', async () => {
    await rentreeApresIncident('panne')
  })

  it('stockage incomplet (échéance) : la reprise ne touche plus la base ni les nouveaux élèves', async () => {
    await rentreeApresIncident('echeance')
  })

  it('reprise en local : n’efface que les dossiers d’élèves disparus, respecte l’échéance', async () => {
    const { db, alice, bob } = await setup()
    await setSetting(db, 'remise_a_zero_annee', '2026')
    await setSetting(db, 'remise_a_zero_base', '2027') // base déjà remise à zéro cette année
    await db.delete(students).where(eq(students.id, alice.id)) // alice disparue ; bob tient lieu d'élève inscrit depuis

    expect(await annualReset(db, ms('2027-08-01T05:00:00Z'), { deadlineMs: Date.now() - 1 }))
      .toEqual({ status: 'partiel', year: 2027, students: 0, classes: 0, files: 0 })
    expect(existe(`projets/${alice.id}/a.sb3`)).toBe(true)
    expect(await repere(db)).toBe('2026')

    expect(await annualReset(db, ms('2027-08-01T05:00:00Z')))
      .toEqual({ status: 'fait', year: 2027, students: 0, classes: 0, files: 1 })
    expect(existe(`projets/${alice.id}`)).toBe(false)
    expect(existe(`projets/${bob.id}/a.sb3`)).toBe(true)
    expect(existe(`projets/${bob.id}/abandon.sb3`)).toBe(true)
    // La base n'est pas touchée en reprise.
    expect(await db.select().from(students)).toHaveLength(1)
    expect(await db.select().from(classes)).toHaveLength(1)
    expect(await db.select().from(loginAttempts)).toHaveLength(2)
    expect(await db.select().from(pushSubscriptions)).toHaveLength(3)
    expect(await repere(db)).toBe('2027')
  })

  it('jamais deux fois la même année', async () => {
    const { db } = await setup()
    await setSetting(db, 'remise_a_zero_annee', '2026')
    expect(await annualReset(db, ms('2027-08-01T05:00:00Z'))).toMatchObject({ status: 'fait', year: 2027, students: 2 })
    await createStudent(db, { email: 'carla.exemple@malraux-rabat.org' })
    expect(await annualReset(db, ms('2027-08-01T18:00:00Z'))).toEqual({ status: 'a-jour', year: 2027 })
    expect(await db.select().from(students)).toHaveLength(1)
  })
})

describe('deleteOrphanFolders (passage quotidien)', () => {
  it('sans orphelin : une lecture de liste, aucune suppression', async () => {
    const { db, alice, bob } = await setup()
    process.env.STORAGE_BACKEND = 'supabase'
    const f = bucketAvecEtat([`projets/${alice.id}/a.sb3`, `projets/${bob.id}/a.sb3`, 'starters/x.sb3'])
    setBucketForTests(f.bucket)
    expect(await deleteOrphanFolders(db)).toEqual({ deleted: 0, complete: true })
    expect(f.list).toHaveBeenCalledTimes(1)
    expect(f.list).toHaveBeenCalledWith('projets', { limit: 100, offset: 0 })
    expect(f.remove).not.toHaveBeenCalled()
    expect(f.etat.size).toBe(3)
  })

  it('efface le dossier d’un élève disparu (envoi direct arrivé après sa suppression), sans toucher base ni repères', async () => {
    const { db, alice, bob } = await setup()
    await setSetting(db, 'remise_a_zero_annee', '2026')
    await setSetting(db, 'remise_a_zero_base', '2026')
    await db.delete(students).where(eq(students.id, alice.id))
    process.env.STORAGE_BACKEND = 'supabase'
    const f = bucketAvecEtat([`projets/${alice.id}/tard.sb3`, `projets/${bob.id}/a.sb3`, 'starters/x.sb3'])
    setBucketForTests(f.bucket)
    expect(await deleteOrphanFolders(db, { deadlineMs: Date.now() + 60_000 })).toEqual({ deleted: 1, complete: true })
    expect([...f.etat].sort()).toEqual([`projets/${bob.id}/a.sb3`, 'starters/x.sb3'].sort())
    expect(await db.select().from(students)).toHaveLength(1)
    expect(await db.select().from(classes)).toHaveLength(1)
    expect(await repere(db)).toBe('2026')
    expect(await repereBase(db)).toBe('2026')
  })

  it('échéance passée : rien n’est effacé, à reprendre', async () => {
    const { db, alice } = await setup()
    await db.delete(students).where(eq(students.id, alice.id))
    process.env.STORAGE_BACKEND = 'supabase'
    const f = bucketAvecEtat([`projets/${alice.id}/a.sb3`])
    setBucketForTests(f.bucket)
    expect(await deleteOrphanFolders(db, { deadlineMs: Date.now() - 1 })).toEqual({ deleted: 0, complete: false })
    expect(f.etat.size).toBe(1)
  })
})
