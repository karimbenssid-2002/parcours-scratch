import { describe, expect, it, vi } from 'vitest'
import { fetchCapytaleProject, parseCapytaleRef, validateCapytaleCookie } from '@/lib/capytale/import'

// Cookie de session factice (forme SSESS + 32 caractères hexadécimaux) et NID inventé.
const cookie = { name: 'SSESS' + '0'.repeat(32), value: 'a'.repeat(32) }

describe('parseCapytaleRef', () => {
  it.each([
    ['https://capytale2.ac-paris.fr/web/c/0a1b-1234567/local', { code: '0a1b-1234567', nid: '1234567' }],
    ['  0A1B-1234567 ', { code: '0a1b-1234567', nid: '1234567' }],
    ['1234567', { code: null, nid: '1234567' }],
  ])('%s', (input, expected) => expect(parseCapytaleRef(input)).toEqual(expected))
  it('refuse le reste', () => {
    expect(parseCapytaleRef('https://exemple.org')).toBeNull()
    expect(parseCapytaleRef('')).toBeNull()
  })
})

describe('validateCapytaleCookie', () => {
  it('accepte un cookie SSESS valide', () => expect(validateCapytaleCookie(cookie.name, cookie.value)).toBeNull())
  it("refuse un nom quelconque et toute tentative d'injection d'en-tête", () => {
    expect(validateCapytaleCookie('session', cookie.value)).not.toBeNull()
    expect(validateCapytaleCookie(cookie.name, 'abc\r\nX-Evil: 1aaaaaaaaaaaaaaaa')).not.toBeNull()
    expect(validateCapytaleCookie(cookie.name, 'court')).not.toBeNull()
  })
})

describe('fetchCapytaleProject', () => {
  it('appelle l’API avec le cookie et renvoie le projet', async () => {
    const fake = vi.fn(async () => new Response(new Uint8Array([80, 75, 3, 4]), { status: 200 }))
    const res = await fetchCapytaleProject('1234567', cookie, fake as unknown as typeof fetch)
    expect(res).toMatchObject({ ok: true })
    const [url, init] = fake.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://capytale2.ac-paris.fr/web/c-act/api/n/1234567/fields/content')
    expect((init.headers as Record<string, string>).Cookie).toBe(`${cookie.name}=${cookie.value}`)
    expect(init.redirect).toBe('manual')
  })

  it.each([
    [403, 'Session Capytale expirée ou cookie incorrect.'],
    [302, 'Session Capytale expirée ou cookie incorrect.'],
    [204, 'Cette activité Capytale est vide.'],
    [404, 'Activité Capytale introuvable.'],
  ])('statut %i → message clair', async (status, message) => {
    const fake = async () => new Response(status === 204 ? null : 'x', { status })
    expect(await fetchCapytaleProject('1234567', cookie, fake as unknown as typeof fetch)).toEqual({ ok: false, error: message })
  })

  it('ne lance aucune requête si le cookie est invalide', async () => {
    const fake = vi.fn()
    expect(await fetchCapytaleProject('1234567', { name: 'x', value: 'y' }, fake as unknown as typeof fetch)).toMatchObject({ ok: false })
    expect(fake).not.toHaveBeenCalled()
  })
})
