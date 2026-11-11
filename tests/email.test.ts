import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { sendEmail } from '@/lib/email'

const msg = { to: 'prof@malraux-rabat.org', subject: 'Sujet', text: 'Mot de passe secret-123' }

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks() })

describe('sendEmail', () => {
  it("sans clé Resend, écrit dans la console et n'appelle pas le réseau", async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    expect(await sendEmail(msg)).toEqual({ delivered: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(console.info).toHaveBeenCalled()
  })

  it('sans clé Resend, en local : la console affiche tout le message (mot de passe provisoire compris)', async () => {
    vi.stubEnv('RESEND_API_KEY', ''); vi.stubEnv('NODE_ENV', 'development')
    vi.stubGlobal('fetch', vi.fn())
    await sendEmail(msg)
    const logged = JSON.stringify((console.info as ReturnType<typeof vi.fn>).mock.calls)
    expect(logged).toContain(msg.to)
    expect(logged).toContain('secret-123')
  })

  it("sans clé Resend, en production : seuls le destinataire et l'objet sont écrits, jamais le corps", async () => {
    vi.stubEnv('RESEND_API_KEY', ''); vi.stubEnv('NODE_ENV', 'production')
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    expect(await sendEmail(msg)).toEqual({ delivered: false })
    expect(fetchMock).not.toHaveBeenCalled()
    const logged = JSON.stringify([(console.info as ReturnType<typeof vi.fn>).mock.calls, (console.error as ReturnType<typeof vi.fn>).mock.calls])
    expect(logged).toContain(msg.to)
    expect(logged).toContain(msg.subject)
    expect(logged).not.toContain('secret-123')
  })

  it("poste le message à l'API Resend avec la clé et l'expéditeur", async () => {
    vi.stubEnv('RESEND_API_KEY', 're_cle'); vi.stubEnv('EMAIL_FROM', 'Parcours <no-reply@exemple.org>')
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 })); vi.stubGlobal('fetch', fetchMock)
    expect(await sendEmail(msg)).toEqual({ delivered: true })
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('https://api.resend.com/emails')
    expect(init.method).toBe('POST')
    expect(init.headers.Authorization).toBe('Bearer re_cle')
    expect(JSON.parse(init.body)).toEqual({ from: 'Parcours <no-reply@exemple.org>', to: msg.to, subject: msg.subject, text: msg.text })
  })

  it('réponse non 2xx : delivered false, sans le corps du message ni la clé dans les logs', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_cle'); vi.stubEnv('EMAIL_FROM', 'a@b.org')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('erreur', { status: 422 })))
    expect(await sendEmail(msg)).toEqual({ delivered: false })
    const logged = JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls)
    expect(logged).toContain('422')
    expect(logged).not.toContain('secret-123')
    expect(logged).not.toContain('re_cle')
  })

  it('erreur réseau : delivered false, sans exception', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_cle'); vi.stubEnv('EMAIL_FROM', 'a@b.org')
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('réseau coupé')))
    expect(await sendEmail(msg)).toEqual({ delivered: false })
    expect(JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('secret-123')
  })

  it("clé définie sans EMAIL_FROM : pas d'appel réseau, delivered false", async () => {
    vi.stubEnv('RESEND_API_KEY', 're_cle'); vi.stubEnv('EMAIL_FROM', '')
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock)
    expect(await sendEmail(msg)).toEqual({ delivered: false })
    expect(fetchMock).not.toHaveBeenCalled()
    expect(JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls)).toContain('EMAIL_FROM')
  })

  it('délai dépassé : delivered false et signal de timeout transmis', async () => {
    vi.stubEnv('RESEND_API_KEY', 're_cle'); vi.stubEnv('EMAIL_FROM', 'a@b.org')
    const fetchMock = vi.fn().mockRejectedValue(new DOMException('timeout', 'TimeoutError')); vi.stubGlobal('fetch', fetchMock)
    expect(await sendEmail(msg)).toEqual({ delivered: false })
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal)
  })
})
