import { describe, expect, it, vi } from 'vitest'
import { pushEnabled, vapidSubject } from '@/lib/push/config'

const keys = { VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }

describe('sujet VAPID', () => {
  it('VAPID_SUBJECT valide prioritaire', () => {
    expect(vapidSubject({ VAPID_SUBJECT: 'mailto:a@exemple.invalid', AUTOGRADE_SITE_URL: 'https://s.exemple.invalid' })).toBe('mailto:a@exemple.invalid')
  })
  it('VAPID_SUBJECT invalide : aucun sujet, pas de repli', () => {
    expect(vapidSubject({ VAPID_SUBJECT: 'nimportequoi', AUTOGRADE_SITE_URL: 'https://s.exemple.invalid' })).toBeNull()
  })
  it('repli sur AUTOGRADE_SITE_URL (URL https complète ou simple hôte)', () => {
    expect(vapidSubject({ AUTOGRADE_SITE_URL: 'https://s.exemple.invalid' })).toBe('https://s.exemple.invalid')
    expect(vapidSubject({ AUTOGRADE_SITE_URL: 's.exemple.invalid' })).toBe('https://s.exemple.invalid')
  })
  it('repli sur VERCEL_PROJECT_PRODUCTION_URL', () => {
    expect(vapidSubject({ VERCEL_PROJECT_PRODUCTION_URL: 'p.exemple.invalid' })).toBe('https://p.exemple.invalid')
  })
  it('aucun sujet : notifications désactivées, une seule ligne de journal fixe', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(vapidSubject({})).toBeNull()
    expect(pushEnabled({ ...keys })).toBe(false)
    expect(pushEnabled({ ...keys })).toBe(false)
    expect(warn).toHaveBeenCalledTimes(1)
    warn.mockRestore()
  })
  it('clés et un repli : activées', () => {
    expect(pushEnabled({ ...keys, VERCEL_PROJECT_PRODUCTION_URL: 'p.exemple.invalid' })).toBe(true)
  })
})
