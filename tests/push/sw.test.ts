import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { describe, expect, it, vi } from 'vitest'

const ORIGIN = 'https://scratch.example.test'

function loadSw(windows: { url: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> }[]) {
  const handlers: Record<string, (e: unknown) => void> = {}
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, fn: (e: unknown) => void) => { handlers[type] = fn },
    clients: { matchAll: vi.fn(async () => windows), openWindow: vi.fn(async () => null), claim: vi.fn() },
    registration: { showNotification: vi.fn(async () => undefined) },
  } as Record<string, unknown>
  const importScripts = (path: string) => runInNewContext(readFileSync(`public${path}`, 'utf8'), { self, URL })
  runInNewContext(readFileSync('public/sw.js', 'utf8'), { self, importScripts, caches: {}, URL })
  return { handlers, self: self as { clients: { openWindow: ReturnType<typeof vi.fn> }; registration: { showNotification: ReturnType<typeof vi.fn> } } }
}
const win = (url: string) => {
  const w = { url, focus: vi.fn(), navigate: vi.fn(async () => undefined) }
  w.focus.mockImplementation(async () => w)
  return w
}
async function click(handlers: Record<string, (e: unknown) => void>, url: unknown) {
  const close = vi.fn()
  let done: Promise<unknown> = Promise.resolve()
  handlers.notificationclick({ notification: { close, data: { url } }, waitUntil: (p: Promise<unknown>) => { done = p } })
  await done
  return close
}

describe('service worker : notificationclick', () => {
  it('fenêtre /admin ouverte et URL /admin/revue/x : mise au premier plan et navigation', async () => {
    const w = win(`${ORIGIN}/admin/classes`)
    const { handlers, self } = loadSw([w])
    const close = await click(handlers, '/admin/revue/x')
    expect(close).toHaveBeenCalled()
    expect(w.focus).toHaveBeenCalled()
    expect(w.navigate).toHaveBeenCalledWith('/admin/revue/x')
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })
  it('une fenêtre de l’autre espace n’est pas réutilisée', async () => {
    const w = win(`${ORIGIN}/defis`)
    const { handlers, self } = loadSw([w])
    await click(handlers, '/admin/revue/x')
    expect(w.focus).not.toHaveBeenCalled()
    expect(self.clients.openWindow).toHaveBeenCalledWith('/admin/revue/x')
  })
  it('espace élève : une fenêtre hors /admin est réutilisée', async () => {
    const w = win(`${ORIGIN}/profil`)
    const { handlers } = loadSw([win(`${ORIGIN}/admin`), w])
    await click(handlers, '/defis/abc')
    expect(w.navigate).toHaveBeenCalledWith('/defis/abc')
  })
  it('URL d’une autre origine : ignorée', async () => {
    const w = win(`${ORIGIN}/admin`)
    const { handlers, self } = loadSw([w])
    await click(handlers, 'https://evil.test/admin/x')
    await click(handlers, undefined)
    expect(w.focus).not.toHaveBeenCalled()
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })
  it('aucune fenêtre : openWindow', async () => {
    const { handlers, self } = loadSw([])
    await click(handlers, '/admin/revue/x')
    expect(self.clients.openWindow).toHaveBeenCalledWith('/admin/revue/x')
  })
  it('mise au premier plan refusée : openWindow en repli', async () => {
    const w = win(`${ORIGIN}/admin`)
    w.focus.mockRejectedValue(new Error('refusée'))
    const { handlers, self } = loadSw([w])
    await click(handlers, '/admin/revue/x')
    expect(self.clients.openWindow).toHaveBeenCalledWith('/admin/revue/x')
  })
  it('navigation refusée : openWindow en repli', async () => {
    const w = win(`${ORIGIN}/admin`)
    w.navigate.mockRejectedValue(new Error('refusée'))
    const { handlers, self } = loadSw([w])
    await click(handlers, '/admin/revue/x')
    expect(self.clients.openWindow).toHaveBeenCalledWith('/admin/revue/x')
  })
})

describe('service worker : push', () => {
  const push = async (text: string | null) => {
    const { handlers, self } = loadSw([])
    let done: Promise<unknown> = Promise.resolve()
    handlers.push({ data: text === null ? null : { text: () => text }, waitUntil: (p: Promise<unknown>) => { done = p } })
    await done
    return self.registration.showNotification
  }
  it('affiche titre, corps, tag, url et l’icône de l’appli enseignant', async () => {
    const show = await push(JSON.stringify({ title: 'Parcours Scratch', body: '2 défis à valider', tag: 'revue', url: '/admin/revue' }))
    expect(show).toHaveBeenCalledWith('Parcours Scratch', { body: '2 défis à valider', tag: 'revue', data: { url: '/admin/revue' }, icon: '/icons/prof-192.png' })
  })
  it('icône élève hors /admin ; adresse d’une autre origine ramenée à l’accueil', async () => {
    const a = await push(JSON.stringify({ title: 'T', body: 'b', url: '/defis' }))
    expect(a).toHaveBeenCalledWith('T', expect.objectContaining({ icon: '/icons/icon-192.png', data: { url: '/defis' } }))
    const b = await push(JSON.stringify({ title: 'T', body: 'b', url: 'https://evil.test/x' }))
    expect(b).toHaveBeenCalledWith('T', expect.objectContaining({ data: { url: '/' } }))
  })
  it('message vide ou illisible : notification neutre', async () => {
    const neutral = ['Parcours Scratch', { body: '', data: { url: '/' }, icon: '/icons/icon-192.png' }]
    expect(await push(null)).toHaveBeenCalledWith(...neutral)
    expect(await push('pas du json')).toHaveBeenCalledWith(...neutral)
    expect(await push('null')).toHaveBeenCalledWith(...neutral)
  })
})
