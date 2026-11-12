import { afterEach, describe, expect, it, vi } from 'vitest'
import { exportPKCS8, generateKeyPair, SignJWT } from 'jose'
import type { RunResult, RunTrace } from '@/lib/autograde/runner/types'

vi.mock('@/lib/auth/session', () => ({ requireTeacher: async () => ({ id: 'prof', role: 'admin' }) }))
vi.mock('next/cache', () => ({ revalidatePath: () => {} }))
vi.mock('@/lib/db/client', () => ({ getDb: () => ({}) }))
vi.mock('@/lib/db/autograde', () => ({
  getAutogradeConfig: async () => ({ activityId: 'a', solutionPath: 'solutions/a.sb3', solutionFormat: 'sb3', criteria: ['x'], answers: [], keys: [], durationMs: 3000 }),
  saveAutogradeSettings: async () => ({ ok: true }),
}))
vi.mock('@/lib/storage/files', () => ({ readStored: async () => Buffer.from('solution inventée') }))
// Chromium local interdit : le bouton doit passer par le service distant.
vi.mock('@/lib/autograde/runner/run', () => ({ runMany: async () => { throw new Error('Chromium local appelé') } }))

const UUID = '11111111-1111-4111-8111-111111111111'
const trace: RunTrace = { finished: true, timedOut: false, error: null, says: [{ sprite: 'Sprite1', text: 'Bonjour', t: 0 }], questions: [], variables: {}, lists: {}, sprites: [], costumeChanges: [], sounds: [], pen: { segments: 0, bbox: null, hash: '' } }
const result: RunResult = { project: { targets: [] }, traces: [trace, trace, trace, trace, trace] }

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals() })

describe('bouton « tester » de la correction automatique', () => {
  it('avec AUTOGRADE_RUNNER_URL : exécute la solution par le service distant', async () => {
    vi.stubEnv('AUTOGRADE_ENABLED', '1')
    vi.stubEnv('AUTOGRADE_RUNNER_URL', 'https://service.invalid')
    // Clé de compte de service fabriquée à l'exécution ; l'échange de jeton de Google est simulé.
    const { privateKey } = await generateKeyPair('RS256', { extractable: true })
    const key = { client_email: 'invocateur@projet-invente.iam.gserviceaccount.com', private_key: await exportPKCS8(privateKey) }
    vi.stubEnv('AUTOGRADE_RUNNER_SA_KEY', Buffer.from(JSON.stringify(key)).toString('base64'))
    vi.stubEnv('AUTOGRADE_AU_BUILD', '0')
    const idToken = await new SignJWT({}).setProtectedHeader({ alg: 'RS256' }).setExpirationTime('1h').sign(privateKey)
    const fetch = vi.fn(async (url: string | URL | Request) => (String(url) === 'https://oauth2.googleapis.com/token' ? Response.json({ id_token: idToken }) : Response.json(result)))
    vi.stubGlobal('fetch', fetch)
    const { testAutogradeAction } = await import('@/app/admin/(espace)/activites/[activityId]/autograde-actions')
    const r = await testAutogradeAction(UUID)
    expect(r.error).toBeUndefined()
    expect(r.identical).toBe(true)
    expect(r.summary).toContain('Bonjour')
    expect(fetch.mock.calls.map((c) => String(c[0]))).toEqual(['https://oauth2.googleapis.com/token', 'https://service.invalid/run'])
  })
})
