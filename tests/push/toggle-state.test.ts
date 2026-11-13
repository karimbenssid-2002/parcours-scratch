import { describe, expect, it } from 'vitest'
import { keyToBytes, sameKey, toggleState } from '@/lib/pwa/notifications'

const base = { standalone: true, supported: true, permission: 'default' as NotificationPermission, subscribed: false, serverKnows: false }

describe('toggleState', () => {
  it('hors appli installée ou sans PushManager : caché', () => {
    expect(toggleState({ ...base, standalone: false })).toBe('hidden')
    expect(toggleState({ ...base, supported: false })).toBe('hidden')
  })
  it('installée, pas abonnée : propose ; refusée : denied ; abonnée et connue du serveur : on', () => {
    expect(toggleState(base)).toBe('offer')
    expect(toggleState({ ...base, permission: 'granted' })).toBe('offer')
    expect(toggleState({ ...base, permission: 'denied' })).toBe('denied')
    expect(toggleState({ ...base, permission: 'granted', subscribed: true, serverKnows: true })).toBe('on')
  })
  it('abonné dans le navigateur mais inconnu du serveur (autre session, téléphone partagé) : offer', () => {
    expect(toggleState({ ...base, permission: 'granted', subscribed: true, serverKnows: false })).toBe('offer')
  })
  it('abonné mais permission retirée depuis : denied', () => {
    expect(toggleState({ ...base, permission: 'denied', subscribed: true, serverKnows: true })).toBe('denied')
  })
})

describe('sameKey', () => {
  const current = keyToBytes('BPabc-_123')
  const buf = (b: Uint8Array) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer
  it('même clé : vrai', () => expect(sameKey(buf(current), current)).toBe(true))
  it('clé non exposée par le navigateur (iOS) : pas d’écart constaté', () => {
    expect(sameKey(null, current)).toBe(true)
    expect(sameKey(undefined, current)).toBe(true)
  })
  it('autre clé ou longueur différente : faux', () => {
    const other = new Uint8Array(current); other[0] ^= 1
    expect(sameKey(buf(other), current)).toBe(false)
    expect(sameKey(buf(current.slice(1)), current)).toBe(false)
  })
})
