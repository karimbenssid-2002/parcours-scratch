export type Platform = 'ios' | 'android'

const INSTALLED_KEY = 'install-prompt-installed' // localStorage : durable
const LATER_KEY = 'install-prompt-later' // sessionStorage : jusqu'à la fermeture de l'appli ou de l'onglet
const INSTALLED_MS = 365 * 24 * 3_600_000 // installée : le navigateur ne le sait plus quand on revient par lui

/** iPhone, iPod, iPad (y compris l'iPad qui se présente comme un Mac) ; tout le reste suit la voie Android. */
export function detectPlatform(userAgent: string, maxTouchPoints: number): Platform {
  if (/iPhone|iPad|iPod/i.test(userAgent)) return 'ios'
  if (/Macintosh/i.test(userAgent) && maxTouchPoints > 1) return 'ios'
  return 'android'
}

/** Déjà lancée depuis l'écran d'accueil : rien à proposer. */
export function isStandalone(): boolean {
  return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
}

type Store = Pick<Storage, 'getItem' | 'setItem'>
const read = (store: Store, key: string) => { try { return store.getItem(key) } catch { return null } }
const write = (store: Store, key: string, value: string) => { try { store.setItem(key, value) } catch { /* stockage bloqué : sans effet */ } }

/** Faut-il proposer l'installation ? Non après « Plus tard » (pour cette ouverture seulement) ni une fois installée.
 *  Stockage indisponible : on propose. */
export function shouldOffer(local: Store, session: Store, nowMs: number): boolean {
  if (read(session, LATER_KEY)) return false
  const installedUntil = Number(read(local, INSTALLED_KEY))
  return !(installedUntil > nowMs)
}

/** « Plus tard » : masquée jusqu'à la prochaine ouverture de l'appli (ou d'un nouvel onglet). */
export function later(session: Store): void {
  write(session, LATER_KEY, '1')
}

/** Appli installée depuis ce navigateur : on ne la repropose plus (pendant un an) en y revenant par le navigateur. */
export function markInstalled(local: Store, nowMs: number): void {
  write(local, INSTALLED_KEY, String(nowMs + INSTALLED_MS))
}
