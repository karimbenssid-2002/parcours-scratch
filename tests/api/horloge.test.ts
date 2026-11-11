import { afterEach, describe, expect, it, vi } from 'vitest'
import { POST } from '@/app/api/test/horloge/route'
import { setClockOffset } from '@/lib/clock'

const req = () => new Request('http://localhost/api/test/horloge', { method: 'POST', body: JSON.stringify({ offsetMs: 1000 }) })

afterEach(() => { vi.unstubAllEnvs(); setClockOffset(0) })

describe('route de test « horloge »', () => {
  it('404 sans E2E_CLOCK', async () => {
    vi.stubEnv('E2E_CLOCK', '')
    expect((await POST(req())).status).toBe(404)
  })

  it('404 sur Vercel, même avec E2E_CLOCK', async () => {
    vi.stubEnv('E2E_CLOCK', '1'); vi.stubEnv('VERCEL', '1')
    expect((await POST(req())).status).toBe(404)
  })

  it('avance l’horloge en e2e local', async () => {
    vi.stubEnv('E2E_CLOCK', '1'); vi.stubEnv('VERCEL', '')
    expect((await POST(req())).status).toBe(200)
  })
})
