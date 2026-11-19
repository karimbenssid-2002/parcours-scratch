// En-têtes de sécurité du site, partagés par proxy.ts (pages, nonce neuf à chaque requête) et next.config.ts
// (fichiers statiques que le proxy ne voit pas). Pas de `server-only` : next.config.ts est chargé par Node au build.

const join = (directives: string[]) => directives.join('; ')

/** Nonce aléatoire, en base64 (Web Crypto : utilisable dans le proxy comme dans Node). */
export function newNonce(): string {
  return btoa(crypto.randomUUID())
}

/** Origine seule (https://xyz.supabase.co) ; adresse illisible : rien, plutôt qu'une erreur sur toutes les pages. */
function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

/** CSP des pages du site. Scripts : seulement ceux qui portent le nonce de la requête (Next le pose sur les siens) et
 * ceux qu'ils chargent ('strict-dynamic'). Styles en ligne permis : les attributs `style=` du site et ceux de React ne
 * peuvent pas porter de nonce. `supabaseUrl` : stockage en ligne, où la page envoie les gros projets par URL signée. */
export function siteCsp(nonce: string, opts: { dev: boolean; supabaseUrl?: string }): string {
  // En développement seulement : React s'appuie sur eval pour reconstruire les piles d'erreurs du serveur.
  const scripts = ["'self'", `'nonce-${nonce}'`, "'strict-dynamic'", ...(opts.dev ? ["'unsafe-eval'"] : [])]
  const connect = ["'self'", ...(opts.supabaseUrl ? [originOf(opts.supabaseUrl)].filter((o) => o !== null) : [])]
  return join([
    "default-src 'self'",
    `script-src ${scripts.join(' ')}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://i.ytimg.com", // miniatures des vidéos d'aide
    "font-src 'self'",
    `connect-src ${connect.join(' ')}`,
    "frame-src 'self' https://www.youtube-nocookie.com", // l'éditeur Scratch (même origine) et les vidéos d'aide
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'",
    // Pas en développement : `next dev` ouvert en http depuis un téléphone (http://192.168.x.x:3000) verrait ses
    // fichiers demandés en https, donc introuvables. Actif en revanche sous `next start` (production locale), même
    // en http : un essai de la version de production depuis un téléphone (http://192.168.x.x:3000) échoue de même.
    ...(opts.dev ? [] : ['upgrade-insecure-requests']),
  ])
}

/** Éditeur Scratch (public/scratch-editor/, iframe de même origine) : il a un script en ligne et compile les programmes
 * avec `new Function`, d'où 'unsafe-inline' et 'unsafe-eval', réservés à ses seuls fichiers. Hôtes scratch.mit.edu :
 * bibliothèques de sprites, sons et arrière-plans (aucun de leurs fichiers n'est sur le site : vignettes sur
 * cdn.assets, fichiers lus par l'éditeur sur assets), extensions Traduction et Synthèse vocale. */
const SCRATCH_ASSETS = 'https://cdn.assets.scratch.mit.edu https://assets.scratch.mit.edu'
export const EDITOR_CSP = join([
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' blob:",
  "worker-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${SCRATCH_ASSETS}`,
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' data: blob: ${SCRATCH_ASSETS} https://translate-service.scratch.mit.edu https://synthesis-service.scratch.mit.edu`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
])

/** Réponses sans HTML à exécuter que le proxy ne voit pas (routes /api/, icônes, manifestes) : rien d'autre que le site,
 * jamais dans le cadre d'un autre site. */
export const STRICT_CSP = join([
  "default-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
])

/** Page hors connexion (public/hors-connexion.html) : un script et des styles en ligne (relance automatique), aucune
 * donnée affichée, rien hors du site. */
export const OFFLINE_PAGE_CSP = join([
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
])

/** Tout le site : caméra et micro pour le site lui-même (enregistrement de sons et détection vidéo de l'éditeur, iframe
 * de même origine), tout le reste coupé. */
export const PERMISSIONS_POLICY = [
  'camera=(self)', 'microphone=(self)', 'geolocation=()', 'payment=()', 'usb=()', 'serial=()', 'bluetooth=()', 'hid=()',
  'magnetometer=()', 'gyroscope=()', 'accelerometer=()', 'display-capture=()', 'browsing-topics=()',
].join(', ')
