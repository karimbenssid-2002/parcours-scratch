// Service worker de la web app Parcours Scratch.
// Volontairement minimal : aucune page ni donnée d'élève n'est mise en cache (tout passe par le réseau,
// avec la session). Seule une page « hors connexion » est gardée, montrée quand le réseau manque.
const CACHE = 'parcours-scratch-v1'
const OFFLINE = '/hors-connexion.html'

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.add(OFFLINE)).then(() => self.skipWaiting()))
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return // le reste : comportement normal du navigateur
  event.respondWith(fetch(event.request).catch(() => caches.match(OFFLINE)))
})
