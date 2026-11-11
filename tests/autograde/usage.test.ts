import { describe, expect, it } from 'vitest'
import { testDb } from '../helpers/db'
import { createTeacher } from '@/lib/db/teachers'
import { createStudent } from '@/lib/db/students'
import { createActivity } from '@/lib/db/activities'
import { recordSave } from '@/lib/db/progress'
import { autogradeJobs, autogradeUsage, progress } from '@/lib/db/schema'
import { monthlyUsage } from '@/lib/autograde/usage'

describe('consommation de la correction automatique', () => {
  it('compte les corrections et le coût du mois (lot à moitié prix)', async () => {
    const db = await testDb()
    const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', passwordHash: 'h', role: 'prof' })
    const s = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org', passwordHash: 'h' })
    const { id: a } = await createActivity(db, { title: 'A' })
    await recordSave(db, s.id, a, 'p.sb3')
    const p = (await db.select().from(progress).limit(1))[0]!
    const job = async (source: 'tests' | 'ai', createdAt: string) => (await db.insert(autogradeJobs).values({
      progressId: p.id, teacherId: prof.id, mode: 'propose', status: 'done', submittedAt: 'x', createdAt,
      result: JSON.stringify({ decision: 'validated', comment: 'ok', criteria: [], source }),
    }).returning())[0]
    await job('tests', '2026-10-02T10:00:00.000Z')
    const j2 = await job('ai', '2026-10-03T10:00:00.000Z')
    const j3 = await job('ai', '2026-10-04T10:00:00.000Z')
    await job('ai', '2026-09-30T10:00:00.000Z') // autre mois
    await db.insert(autogradeUsage).values([
      { jobId: j2.id, model: 'claude-haiku-4-5', inputTokens: 1000, outputTokens: 200, batch: false, createdAt: '2026-10-03T10:00:00.000Z' },
      { jobId: j3.id, model: 'claude-haiku-4-5', inputTokens: 1000, outputTokens: 200, batch: true, createdAt: '2026-10-04T10:00:00.000Z' },
    ])
    const usage = await monthlyUsage(db, '2026-10')
    expect(usage).toMatchObject({ corrections: 3, withoutAi: 1, aiCalls: 2, inputTokens: 2000, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 400 })
    expect(usage.costUsd).toBeCloseTo(((1000 * 1 + 200 * 5) / 1e6) * 1.5, 10)
  })

  it('applique les tarifs de Sonnet 5.5 et du cache', async () => {
    const db = await testDb()
    await db.insert(autogradeUsage).values({ model: 'claude-sonnet-5-5', inputTokens: 1000, cacheReadTokens: 2000, cacheWriteTokens: 1000, outputTokens: 100, batch: false, createdAt: '2026-10-05T00:00:00.000Z' })
    expect((await monthlyUsage(db, '2026-10')).costUsd).toBeCloseTo((1000 * 2 + 2000 * 0.2 + 1000 * 2.5 + 100 * 10) / 1e6, 10)
  })
})
