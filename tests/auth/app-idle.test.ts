import { afterEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { proxy } from '@/proxy'
import { ADMIN_COOKIE, STUDENT_COOKIE, secretKey, signAdmin, signStudent } from '@/lib/auth/jwt'
import { APP_IDLE_MS, appIdleExpired, appSeenCookie, areaOf, readSeen, signSeen } from '@/lib/auth/app-idle'

const ORIGIN = 'https://scratch.example.test'
const adminSecret = () => secretKey('AUTH_SECRET')

function request(path: string, cookies: Record<string, string>) {
  const cookie = Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
  return new NextRequest(new URL(path, ORIGIN), { headers: { cookie } })
}
const setCookie = (res: Response, name: string) => res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))

afterEach(() => { vi.useRealTimers() })

describe('dernier passage signé', () => {
  it('relu tel quel avec le même jeton', async () => {
    const v = await signSeen(1_000, 'jeton-a', adminSecret())
    expect(await readSeen(v, 'jeton-a', adminSecret())).toBe(1_000)
  })
  it("refusé s'il vient d'une autre session ou s'il est modifié", async () => {
    const v = await signSeen(1_000, 'jeton-a', adminSecret())
    expect(await readSeen(v, 'jeton-b', adminSecret())).toBeNull()
    expect(await readSeen(v.replace(/^1000/, '9999'), 'jeton-a', adminSecret())).toBeNull()
    expect(await readSeen('n-importe-quoi', 'jeton-a', adminSecret())).toBeNull()
    expect(await readSeen(undefined, 'jeton-a', adminSecret())).toBeNull()
  })
  it('expire après 5 minutes, seulement en appli et avec un passage connu', () => {
    expect(appIdleExpired({ appMode: true, seenMs: 0, nowMs: APP_IDLE_MS + 1 })).toBe(true)
    expect(appIdleExpired({ appMode: true, seenMs: 0, nowMs: APP_IDLE_MS })).toBe(false)
    expect(appIdleExpired({ appMode: false, seenMs: 0, nowMs: APP_IDLE_MS * 10 })).toBe(false)
    expect(appIdleExpired({ appMode: true, seenMs: null, nowMs: APP_IDLE_MS * 10 })).toBe(false)
  })
  it('espace selon l’adresse', () => {
    expect(areaOf('/admin')).toBe('admin')
    expect(areaOf('/admin/plus')).toBe('admin')
    expect(areaOf('/administrer')).toBe('eleve')
    expect(areaOf('/defis/x')).toBe('eleve')
  })
})

describe("proxy : appli installée fermée plus de 5 minutes", () => {
  const now = Date.UTC(2026, 10, 13, 10, 0, 0)
  const prof = { teacherId: 't-fictif', username: 'prof.fictif', role: 'prof' as const }

  it('appli rouverte après 6 minutes : session effacée, connexion avec le message', async () => {
    vi.useFakeTimers({ now })
    const token = await signAdmin(prof)
    const seen = await signSeen(now - 6 * 60_000, token, adminSecret())
    const res = await proxy(request('/admin/plus', { [ADMIN_COOKIE]: token, app_mode_admin: '1', [appSeenCookie('admin')]: seen }))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/admin/login?inactivite=1`)
    expect(setCookie(res, ADMIN_COOKIE)).toMatch(/Expires=Thu, 01 Jan 1970|Max-Age=0/)
  })

  it('appli rouverte après 2 minutes : la page s’ouvre et le passage est renouvelé', async () => {
    vi.useFakeTimers({ now })
    const token = await signAdmin(prof)
    const seen = await signSeen(now - 2 * 60_000, token, adminSecret())
    const res = await proxy(request('/admin/plus', { [ADMIN_COOKIE]: token, app_mode_admin: '1', [appSeenCookie('admin')]: seen }))
    expect(res.headers.get('location')).toBeNull()
    const renewed = setCookie(res, appSeenCookie('admin'))!.split(';')[0].split('=')[1]
    expect(await readSeen(decodeURIComponent(renewed), token, adminSecret())).toBe(now)
  })

  it('navigateur (pas d’appli) : aucune déconnexion, même après des heures', async () => {
    vi.useFakeTimers({ now })
    const token = await signAdmin(prof)
    const seen = await signSeen(now - 5 * 3_600_000, token, adminSecret())
    const res = await proxy(request('/admin/plus', { [ADMIN_COOKIE]: token, [appSeenCookie('admin')]: seen }))
    expect(res.headers.get('location')).toBeNull()
    expect(setCookie(res, ADMIN_COOKIE)).toBeUndefined()
  })

  it('nouvelle connexion : un ancien passage (autre session) ne déconnecte pas', async () => {
    vi.useFakeTimers({ now })
    const old = await signSeen(now - 3_600_000, 'ancien-jeton', adminSecret())
    const res = await proxy(request('/admin', { [ADMIN_COOKIE]: await signAdmin(prof), app_mode_admin: '1', [appSeenCookie('admin')]: old }))
    expect(res.headers.get('location')).toBeNull()
  })

  it("appli élève : même règle, et l'appli enseignant ne prolonge pas la session élève", async () => {
    vi.useFakeTimers({ now })
    const token = await signStudent({ studentId: 's-fictif' })
    const seen = await signSeen(now - 10 * 60_000, token, secretKey('STUDENT_AUTH_SECRET'))
    const cookies = { [STUDENT_COOKIE]: token, app_mode_eleve: '1', [appSeenCookie('eleve')]: seen }
    const viaAdmin = await proxy(request('/admin/login', cookies))
    expect(setCookie(viaAdmin, appSeenCookie('eleve'))).toBeUndefined()
    const res = await proxy(request('/', cookies))
    expect(res.headers.get('location')).toBe(`${ORIGIN}/connexion?inactivite=1`)
  })
})
