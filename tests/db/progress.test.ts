import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { createStudent } from '@/lib/db/students'
import { upsertBreizhActivity } from '@/lib/db/activities'
import { createTeacher } from '@/lib/db/teachers'
import { progress, reviews } from '@/lib/db/schema'
import { getProgress, latestReview, progressByActivity, recentReviewsForStudent, recordSave, restartProgress, submitProgress } from '@/lib/db/progress'

async function setup() {
  const db = await testDb()
  const s = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org', passwordHash: 'h' })
  const a = await upsertBreizhActivity(db, { sourceRef: 1, title: 'Défi', slug: 'defi', statementYoutubeId: null, thumbnail: null })
  return { db, studentId: s.id, activityId: a.id }
}

describe('progression', () => {
  it('la première sauvegarde crée la progression « En cours »', async () => {
    const { db, studentId, activityId } = await setup()
    expect(await getProgress(db, studentId, activityId)).toBeNull()
    expect(await recordSave(db, studentId, activityId, 'projets/x.sb3')).toBe(true)
    expect(await getProgress(db, studentId, activityId)).toMatchObject({ status: 'in_progress', projectPath: 'projets/x.sb3' })
    expect((await progressByActivity(db, studentId)).get(activityId)).toBe('in_progress')
  })

  it('soumettre puis refuser toute sauvegarde ultérieure (deuxième onglet)', async () => {
    const { db, studentId, activityId } = await setup()
    await recordSave(db, studentId, activityId, 'projets/x.sb3')
    expect(await submitProgress(db, studentId, activityId)).toBe(true)
    expect(await recordSave(db, studentId, activityId, 'projets/x.sb3')).toBe(false)
    expect((await getProgress(db, studentId, activityId))?.status).toBe('submitted')
    expect(await submitProgress(db, studentId, activityId)).toBe(false)
  })

  it('ne soumet pas un défi jamais sauvegardé', async () => {
    const { db, studentId, activityId } = await setup()
    expect(await submitProgress(db, studentId, activityId)).toBe(false)
  })

  it('« presque validé » reste affiché après une sauvegarde, et peut être resoumis', async () => {
    const { db, studentId, activityId } = await setup()
    await recordSave(db, studentId, activityId, 'projets/x.sb3')
    await db.update(progress).set({ status: 'almost' }).where(eq(progress.studentId, studentId))
    expect(await recordSave(db, studentId, activityId, 'projets/x.sb3')).toBe(true)
    expect((await getProgress(db, studentId, activityId))?.status).toBe('almost')
    expect(await submitProgress(db, studentId, activityId)).toBe(true)
  })

  it('recommencer efface le chemin du projet et renvoie l’ancien', async () => {
    const { db, studentId, activityId } = await setup()
    await recordSave(db, studentId, activityId, 'projets/x.sb3')
    expect(await restartProgress(db, studentId, activityId)).toEqual({ ok: true, previousPath: 'projets/x.sb3' })
    expect((await getProgress(db, studentId, activityId))?.projectPath).toBeNull()
    await recordSave(db, studentId, activityId, 'projets/x.sb3')
    await submitProgress(db, studentId, activityId)
    expect(await restartProgress(db, studentId, activityId)).toEqual({ ok: false, previousPath: null })
  })

  it('renvoie la dernière revue avec le nom du professeur', async () => {
    const { db, studentId, activityId } = await setup()
    await recordSave(db, studentId, activityId, 'projets/x.sb3')
    const p = (await getProgress(db, studentId, activityId))!
    const t = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
    await db.insert(reviews).values({ progressId: p.id, teacherId: t.id, decision: 'needs_work', comment: 'Le serpent ne tourne pas.', createdAt: '2026-10-01T10:00:00.000Z' })
    await db.insert(reviews).values({ progressId: p.id, teacherId: t.id, decision: 'almost', comment: 'Presque !', createdAt: '2026-10-02T10:00:00.000Z' })
    expect(await latestReview(db, p.id)).toMatchObject({ decision: 'almost', comment: 'Presque !', teacherName: 'Emma Test' })
  })
})

describe('derniers retours de l’élève', () => {
  it('liste les commentaires de ses défis, du plus récent au plus ancien, limités et filtrés', async () => {
    const { db, studentId, activityId } = await setup()
    const other = await upsertBreizhActivity(db, { sourceRef: 2, title: 'Autre défi', slug: 'autre', statementYoutubeId: null, thumbnail: null })
    const intrus = await createStudent(db, { email: 'bob.essai@malraux-rabat.org', passwordHash: 'h' })
    const t = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
    await recordSave(db, studentId, activityId, 'projets/a.sb3')
    await recordSave(db, studentId, other.id, 'projets/b.sb3')
    await recordSave(db, intrus.id, activityId, 'projets/c.sb3')
    const pA = (await getProgress(db, studentId, activityId))!
    const pB = (await getProgress(db, studentId, other.id))!
    const pIntrus = (await getProgress(db, intrus.id, activityId))!
    const review = (progressId: string, comment: string | null, day: number) =>
      db.insert(reviews).values({ progressId, teacherId: t.id, decision: 'almost', comment, createdAt: `2026-10-0${day}T10:00:00.000Z` })
    await review(pA.id, 'Premier', 1)
    await review(pB.id, 'Deuxième', 2)
    await review(pIntrus.id, 'Pas pour toi', 5)

    const all = await recentReviewsForStudent(db, studentId, [activityId, other.id])
    expect(all.map((r) => r.comment)).toEqual(['Deuxième', 'Premier'])
    expect(all[0]).toMatchObject({ activityId: other.id, title: 'Autre défi', decision: 'almost', teacherName: 'Emma Test', createdAt: '2026-10-02T10:00:00.000Z' })

    expect((await recentReviewsForStudent(db, studentId, [activityId])).map((r) => r.comment)).toEqual(['Premier']) // défi plus attribué : masqué
    expect(await recentReviewsForStudent(db, studentId, [activityId, other.id], 1)).toHaveLength(1)
    expect(await recentReviewsForStudent(db, studentId, [])).toEqual([])
  })
})

describe('derniers retours de l’élève : seule la dernière décision de chaque défi compte', () => {
  it('une validation sans commentaire masque l’ancien « non réussi » commenté', async () => {
    const { db, studentId, activityId } = await setup()
    const t = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
    await recordSave(db, studentId, activityId, 'projets/a.sb3')
    const p = (await getProgress(db, studentId, activityId))!
    await db.insert(reviews).values({ progressId: p.id, teacherId: t.id, decision: 'needs_work', comment: 'Il manque le virage.', createdAt: '2026-10-01T10:00:00.000Z' })
    expect((await recentReviewsForStudent(db, studentId, [activityId])).map((r) => r.decision)).toEqual(['needs_work'])
    await db.insert(reviews).values({ progressId: p.id, teacherId: t.id, decision: 'validated', comment: null, createdAt: '2026-10-03T10:00:00.000Z' })
    expect(await recentReviewsForStudent(db, studentId, [activityId])).toEqual([])
    await db.insert(reviews).values({ progressId: p.id, teacherId: t.id, decision: 'almost', comment: '   ', createdAt: '2026-10-04T10:00:00.000Z' }) // commentaire vide : rien non plus
    expect(await recentReviewsForStudent(db, studentId, [activityId])).toEqual([])
  })

  it('deux décisions commentées sur le même défi : seule la plus récente apparaît', async () => {
    const { db, studentId, activityId } = await setup()
    const t = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
    await recordSave(db, studentId, activityId, 'projets/a.sb3')
    const p = (await getProgress(db, studentId, activityId))!
    await db.insert(reviews).values({ progressId: p.id, teacherId: t.id, decision: 'needs_work', comment: 'Ancien', createdAt: '2026-10-01T10:00:00.000Z' })
    await db.insert(reviews).values({ progressId: p.id, teacherId: t.id, decision: 'almost', comment: 'Récent', createdAt: '2026-10-02T10:00:00.000Z' })
    expect((await recentReviewsForStudent(db, studentId, [activityId])).map((r) => r.comment)).toEqual(['Récent'])
  })
})
