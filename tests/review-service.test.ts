import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from './helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { addToLevel, setActivityStatus, upsertBreizhActivity } from '@/lib/db/activities'
import { recordSave, restartProgress, submitProgress, getProgress } from '@/lib/db/progress'
import { addEmailsToClass, createClass } from '@/lib/db/classes'
import { progress, reviews } from '@/lib/db/schema'
import { addAssignments, setAssignmentDue, studentDeadline } from '@/lib/db/assignments'
import { countReviewQueue, decide, getReviewView, pendingByClass, queueNeighbors, reviewQueue, studentOverview } from '@/lib/review/service'

async function setup() {
  const db = await testDb()
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
  const other = await createTeacher(db, { email: 'david.essai@malraux-rabat.org', username: 'david.essai', firstName: 'David', lastName: 'Essai', role: 'prof' })
  const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
  const a = await upsertBreizhActivity(db, { sourceRef: 1, title: 'Le serpent', slug: 'le-serpent', statementYoutubeId: null, thumbnail: null })
  await addToLevel(db, { level: '6', activityId: a.id, position: 1, section: 'defis' })
  await setActivityStatus(db, a.id, 'published')
  const c1 = await createClass(db, prof.id, { name: '6e A', level: '6' })
  const c2 = await createClass(db, prof.id, { name: 'Club Scratch', level: '6' })
  await addEmailsToClass(db, c1.id, [alice.email])
  await addEmailsToClass(db, c2.id, [alice.email]) // la même élève dans deux classes
  await addAssignments(db, c1.id, [a.id])
  await recordSave(db, alice.id, a.id, 'projets/x.sb3')
  await submitProgress(db, alice.id, a.id)
  const progressId = (await getProgress(db, alice.id, a.id))!.id
  return { db, prof, other, alice, activityId: a.id, progressId, c1, c2 }
}

describe('file « À valider »', () => {
  it('liste une seule fois les défis soumis des élèves de ses classes', async () => {
    const { db, prof, other, progressId } = await setup()
    expect(await reviewQueue(db, prof.id)).toEqual([expect.objectContaining({ progressId, studentName: 'Alice Exemple', activityTitle: 'Le serpent' })])
    expect(await reviewQueue(db, other.id)).toEqual([])
  })

  it('compte la file comme reviewQueue (élève de deux classes comptée une fois)', async () => {
    const { db, prof, other } = await setup()
    expect(await countReviewQueue(db, prof.id)).toBe(1)
    expect(await countReviewQueue(db, other.id)).toBe(0)
  })

  it('se filtre par classe, et refuse la classe d’un autre enseignant', async () => {
    const { db, prof, other, progressId, c1, c2 } = await setup()
    const c3 = await createClass(db, prof.id, { name: '5e B', level: '5' })
    expect(await reviewQueue(db, prof.id, c1.id)).toEqual([expect.objectContaining({ progressId })])
    expect(await reviewQueue(db, prof.id, c2.id)).toEqual([expect.objectContaining({ progressId })])
    expect(await reviewQueue(db, prof.id, c3.id)).toEqual([])
    expect(await reviewQueue(db, other.id, c1.id)).toEqual([])
  })

  it('compte les défis en attente de chaque classe de l’enseignant', async () => {
    const { db, prof, other, c1, c2 } = await setup()
    const c3 = await createClass(db, prof.id, { name: '5e B', level: '5' })
    expect(await pendingByClass(db, prof.id)).toEqual([
      { classId: c3.id, name: '5e B', level: '5', pending: 0 },
      { classId: c1.id, name: '6e A', level: '6', pending: 1 },
      { classId: c2.id, name: 'Club Scratch', level: '6', pending: 1 },
    ])
    expect(await pendingByClass(db, other.id)).toEqual([])
  })
})

describe('vue de revue', () => {
  it("n'est accessible qu'à un enseignant de l'élève", async () => {
    const { db, prof, other, progressId } = await setup()
    expect((await getReviewView(db, prof.id, progressId))?.student.firstName).toBe('Alice')
    expect(await getReviewView(db, other.id, progressId)).toBeNull()
    expect(await getReviewView(db, prof.id, 'pas-un-uuid')).toBeNull()
  })
})

describe('décision', () => {
  it('exige un commentaire pour « presque validé » et « en cours de validation »', async () => {
    const { db, prof, progressId } = await setup()
    expect(await decide(db, prof.id, progressId, { decision: 'almost', comment: '  ' })).toMatchObject({ ok: false })
    expect(await decide(db, prof.id, progressId, { decision: 'needs_work', comment: '' })).toMatchObject({ ok: false })
    expect(await decide(db, prof.id, progressId, { decision: 'n_importe', comment: 'x' })).toMatchObject({ ok: false })
  })

  it('« presque validé » rend la main à l’élève et garde l’historique', async () => {
    const { db, prof, alice, activityId, progressId } = await setup()
    expect(await decide(db, prof.id, progressId, { decision: 'almost', comment: 'Le serpent doit tourner au bout.' })).toEqual({ ok: true })
    expect((await getProgress(db, alice.id, activityId))?.status).toBe('almost')
    const view = await getReviewView(db, prof.id, progressId)
    expect(view?.history).toEqual([expect.objectContaining({ decision: 'almost', comment: 'Le serpent doit tourner au bout.', teacherName: 'Emma Test' })])
  })

  it('« validé » clôture le défi avec une date de validation, commentaire facultatif', async () => {
    const { db, prof, alice, activityId, progressId } = await setup()
    expect(await decide(db, prof.id, progressId, { decision: 'validated', comment: '' })).toEqual({ ok: true })
    const p = await getProgress(db, alice.id, activityId)
    expect(p).toMatchObject({ status: 'validated' })
    expect(p?.validatedAt).toBeTruthy()
  })

  it('deux décisions simultanées : une seule est enregistrée', async () => {
    const { db, prof, progressId } = await setup()
    const results = await Promise.all([
      decide(db, prof.id, progressId, { decision: 'validated', comment: '' }),
      decide(db, prof.id, progressId, { decision: 'needs_work', comment: 'À reprendre' }),
    ])
    expect(results.filter((r) => r.ok)).toHaveLength(1)
    expect(await db.select().from(reviews).where(eq(reviews.progressId, progressId))).toHaveLength(1)
  })

  it('refuse une décision si le défi n’est plus soumis', async () => {
    const { db, prof, alice, activityId, progressId } = await setup()
    await decide(db, prof.id, progressId, { decision: 'almost', comment: 'Presque' })
    await restartProgress(db, alice.id, activityId)
    expect(await decide(db, prof.id, progressId, { decision: 'validated', comment: '' })).toMatchObject({ ok: false })
  })

  it("refuse la décision d'un enseignant qui n'a pas l'élève", async () => {
    const { db, other, progressId } = await setup()
    expect(await decide(db, other.id, progressId, { decision: 'validated', comment: '' })).toMatchObject({ ok: false })
  })
})

describe('fiche élève', () => {
  it('la fiche liste la progression, seulement pour un enseignant de l’élève', async () => {
    const { db, prof, other, alice } = await setup()
    expect((await studentOverview(db, prof.id, alice.id))?.items).toEqual([expect.objectContaining({ activityTitle: 'Le serpent', status: 'submitted' })])
    expect(await studentOverview(db, other.id, alice.id)).toBeNull()
  })
})

describe('précédent / suivant dans la file', () => {
  it('donne les voisins dans la file, ou rien si le défi n’y est pas', () => {
    const q = ['a', 'b', 'c'].map((progressId) => ({ progressId, studentId: '', studentName: '', activityId: '', activityTitle: '', submittedAt: '', autoSubmitted: false }))
    expect(queueNeighbors(q, 'b')).toEqual({ previous: 'a', next: 'c' })
    expect(queueNeighbors(q, 'a')).toEqual({ previous: null, next: 'b' })
    expect(queueNeighbors(q, 'c')).toEqual({ previous: 'b', next: null })
    expect(queueNeighbors(q, 'z')).toEqual({ previous: null, next: 'a' })
  })
})

describe('échéances dans la revue', () => {
  it('accorde un délai avec « presque réussi » ; refuse un délai invalide ou avec « validé »', async () => {
    const { db, prof, progressId, alice, activityId, c1 } = await setup()
    await setAssignmentDue(db, c1.id, activityId, '2026-01-01T10:00:00.000Z') // échéance de la classe passée
    expect(await decide(db, prof.id, progressId, { decision: 'almost', comment: 'Presque', extendTo: 'demain' }))
      .toMatchObject({ ok: false, error: 'Date limite invalide : indiquez un jour et une heure.' })
    expect(await decide(db, prof.id, progressId, { decision: 'validated', comment: '', extendTo: '2099-01-01T10:00' }))
      .toMatchObject({ ok: false })
    expect(await decide(db, prof.id, progressId, { decision: 'almost', comment: 'Presque', extendTo: '2099-01-01T10:00' })).toEqual({ ok: true })
    expect((await studentDeadline(db, alice.id, activityId)).dueAt).toBe('2099-01-01T09:00:00.000Z')
  })

  it('signale dans la file un travail rendu automatiquement', async () => {
    const { db, prof, progressId } = await setup()
    expect((await reviewQueue(db, prof.id))[0].autoSubmitted).toBe(false)
    await db.update(progress).set({ autoSubmittedAt: '2026-10-14T17:02:00.000Z' }).where(eq(progress.id, progressId))
    expect((await reviewQueue(db, prof.id))[0].autoSubmitted).toBe(true)
  })

  it('refuse un délai sur un défi qu’aucune de ses classes ne donne, sans enregistrer la décision', async () => {
    const { db, other, progressId, alice, activityId } = await setup()
    const club = await createClass(db, other.id, { name: 'Club', level: '6' })
    await addEmailsToClass(db, club.id, [alice.email]) // l'autre enseignant voit l'élève, mais ne donne pas ce défi
    expect(await decide(db, other.id, progressId, { decision: 'almost', comment: 'Presque', extendTo: '2099-01-01T10:00' }))
      .toMatchObject({ ok: false, error: 'Ce défi n’est donné à cet élève par aucune de vos classes.' })
    expect((await getProgress(db, alice.id, activityId))!.status).toBe('submitted')
  })
})

describe('historique et correction automatique', () => {
  it('signale au professeur une décision automatique, et qui l’a vérifiée', async () => {
    const { db, prof, progressId } = await setup()
    expect(await decide(db, prof.id, progressId, { decision: 'almost', comment: 'Presque' }, { automatic: true, verifiedBy: prof.id })).toEqual({ ok: true })
    const view = (await getReviewView(db, prof.id, progressId))!
    expect(view.history[0]).toMatchObject({ automatic: true, verifiedByName: 'Emma Test', teacherName: 'Emma Test' })
  })
  it('une décision manuelle n’est pas marquée automatique', async () => {
    const { db, prof, progressId } = await setup()
    await decide(db, prof.id, progressId, { decision: 'validated', comment: '' })
    expect((await getReviewView(db, prof.id, progressId))!.history[0]).toMatchObject({ automatic: false, verifiedByName: null })
  })
})

