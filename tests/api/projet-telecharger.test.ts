import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { NextRequest } from 'next/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { testDb } from '../helpers/db'
import { createStudent } from '@/lib/db/students'
import { createTeacher } from '@/lib/db/teachers'
import { setActivityStatus, upsertBreizhActivity } from '@/lib/db/activities'
import { addAssignments } from '@/lib/db/assignments'
import { addEmailsToClass, createClass } from '@/lib/db/classes'

const ctx = vi.hoisted(() => ({ db: null as unknown, student: null as unknown }))
vi.mock('@/lib/auth/session', () => ({ getStudentForApi: async () => ctx.student }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ctx.db }))

const projets = await import('@/app/api/projets/[activityId]/route')
const sb3 = new Uint8Array(fs.readFileSync('tests/fixtures/defi1-capytale.sb3'))

beforeEach(() => {
  process.env.STORAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'telecharger-'))
  delete process.env.STORAGE_BACKEND
  ctx.student = null
})

const params = (activityId: string) => ({ params: Promise.resolve({ activityId }) })

async function setup() {
  const db = await testDb()
  ctx.db = db
  const alice = await createStudent(db, { email: 'alice.exemple@malraux-rabat.org' })
  const prof = await createTeacher(db, { email: 'emma.test@malraux-rabat.org', username: 'emma.test', firstName: 'Emma', lastName: 'Test', role: 'prof' })
  const a = await upsertBreizhActivity(db, { sourceRef: 3, title: 'Le serpent', slug: 'le-serpent', statementYoutubeId: null, thumbnail: null })
  await setActivityStatus(db, a.id, 'published')
  const cls = await createClass(db, prof.id, { name: '6e A', level: '6' })
  await addEmailsToClass(db, cls.id, [alice.email])
  await addAssignments(db, cls.id, [a.id])
  ctx.student = alice
  const put = await projets.PUT(new NextRequest(`http://localhost/api/projets/${a.id}`, { method: 'PUT', body: new Uint8Array(sb3), headers: { 'Content-Type': 'application/octet-stream' } }), params(a.id))
  expect(put.status).toBe(200)
  return { activityId: a.id }
}

describe('téléchargement du projet', () => {
  it('?telecharger=1 renvoie les mêmes octets, en pièce jointe nommée d’après le défi', async () => {
    const { activityId } = await setup()
    const plain = await projets.GET(new NextRequest(`http://localhost/api/projets/${activityId}`), params(activityId))
    const dl = await projets.GET(new NextRequest(`http://localhost/api/projets/${activityId}?telecharger=1`), params(activityId))
    expect(dl.status).toBe(200)
    expect(new Uint8Array(await dl.arrayBuffer())).toEqual(new Uint8Array(await plain.arrayBuffer()))
    expect(dl.headers.get('Content-Disposition')).toBe(`attachment; filename="le-serpent.sb3"; filename*=UTF-8''le-serpent.sb3`)
    expect(plain.headers.get('Content-Disposition')).toBeNull()
  })

  it('sans session : 401', async () => {
    const { activityId } = await setup()
    ctx.student = null
    const res = await projets.GET(new NextRequest(`http://localhost/api/projets/${activityId}?telecharger=1`), params(activityId))
    expect(res.status).toBe(401)
  })
})
