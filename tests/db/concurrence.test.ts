import { describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { testDb } from '../helpers/db'
import { createStudent } from '@/lib/db/students'
import { upsertBreizhActivity } from '@/lib/db/activities'
import { progress } from '@/lib/db/schema'
import { recordSave } from '@/lib/db/progress'

describe('accès concurrents', () => {
  it('deux sauvegardes simultanées ne créent qu’une progression', async () => {
    const db = await testDb()
    const s = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
    const a = await upsertBreizhActivity(db, { sourceRef: 1, title: 'Défi', slug: 'defi', statementYoutubeId: null, thumbnail: null })
    const results = await Promise.all([
      recordSave(db, s.id, a.id, 'projets/p1.sb3'),
      recordSave(db, s.id, a.id, 'projets/p2.sb3'),
    ])
    expect(results).toEqual([true, true])
    const rows = await db.select().from(progress).where(eq(progress.studentId, s.id))
    expect(rows).toHaveLength(1)
    expect(rows[0].status).toBe('in_progress')
  })
})
