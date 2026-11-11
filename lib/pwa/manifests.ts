import type { MetadataRoute } from 'next'

/** Deux web apps installables, chacune avec son icône et sa porte d'entrée :
 *  l'appli élève démarre sur l'espace élève, l'appli prof sur l'espace enseignant (/admin). */
const common = {
  lang: 'fr',
  display: 'standalone',
  orientation: 'portrait',
  background_color: '#eef1f7',
  theme_color: '#1e3f9e',
} satisfies MetadataRoute.Manifest

export const studentManifest: MetadataRoute.Manifest = {
  ...common,
  id: '/',
  name: 'Parcours Scratch — Lycée André-Malraux',
  short_name: 'Parcours Scratch',
  description: 'Tes défis Scratch, ton avancement et les retours de ton professeur.',
  start_url: '/?source=app',
  scope: '/',
  icons: [
    { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}

export const teacherManifest: MetadataRoute.Manifest = {
  ...common,
  id: '/admin',
  name: 'Parcours Scratch Prof — Lycée André-Malraux',
  short_name: 'Scratch Prof',
  description: 'Défis à valider, suivi des classes et correction automatique.',
  start_url: '/admin?source=app',
  scope: '/admin',
  icons: [
    { src: '/icons/prof-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
    { src: '/icons/prof-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    { src: '/icons/prof-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
  ],
}
