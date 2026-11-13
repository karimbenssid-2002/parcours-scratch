import { describe, expect, it } from 'vitest'
import { chromeIntentUrl, needsChromeFallback } from '@/lib/pwa/notifications'

const android = 'Mozilla/5.0 (Linux; Android 15; 24117RN76O) AppleWebKit/537.36 Chrome/142.0 Mobile Safari/537.36'
const base = { step: 'abonnement', errorName: 'AbortError', standalone: true, userAgent: android }

describe("repli par Chrome quand l'appli installée ne peut pas s'abonner", () => {
  it('Android, appli installée, AbortError à l’abonnement : repli', () => { expect(needsChromeFallback(base)).toBe(true) })
  it('pas dans l’appli installée : pas de repli', () => { expect(needsChromeFallback({ ...base, standalone: false })).toBe(false) })
  it('iPhone : pas de repli', () => { expect(needsChromeFallback({ ...base, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })).toBe(false) })
  it('autre erreur ou autre étape : pas de repli', () => {
    expect(needsChromeFallback({ ...base, errorName: 'NotAllowedError' })).toBe(false)
    expect(needsChromeFallback({ ...base, step: 'serveur' })).toBe(false)
  })
  it('lien intent vers Chrome avec le bouton affiché', () => {
    expect(chromeIntentUrl('scratch.example.test', '/admin/plus')).toBe('intent://scratch.example.test/admin/plus?notifs=chrome#Intent;scheme=https;package=com.android.chrome;end')
  })
})
