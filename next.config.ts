import type { NextConfig } from 'next'

/** Jamais dans le code serveur déployé : la base, les travaux des élèves, les fichiers de test/dev, et PGlite
 * (PostgreSQL en WebAssembly, local et tests uniquement), le code en ligne passant toujours par postgres-js. */
const TRACE_EXCLUDES = ['./data/**/*', './storage/**/*', './test-results/**/*', './.next-e2e/**/*', './site breizh/**/*', './design-export/**/*', './design_handoff_scratch_glass/**/*', './docs/**/*', './node_modules/@electric-sql/pglite/**/*']
/** Chromium (playwright-core) et l'éditeur Scratch lu par le correcteur ne servent côté serveur qu'à l'exécution locale :
 * écartés sans correction automatique au build (AUTOGRADE_ENABLED absent), ou quand les programmes sont exécutés par le
 * service distant (AUTOGRADE_RUNNER_URL défini au build, en ligne), et toujours sur Vercel (VERCEL défini au build) :
 * aucune exécution n'y est possible. L'éditeur reste servi comme fichier statique de public/ : seul le traçage des
 * fonctions serveur l'écarte. */
const AUTOGRADE_TRACE_EXCLUDES = ['./public/scratch-editor/**/*', './node_modules/playwright-core/**/*']
const chromiumLocalAuBuild = process.env.AUTOGRADE_ENABLED === '1' && !process.env.AUTOGRADE_RUNNER_URL && !process.env.VERCEL
const traceExcludes = [...TRACE_EXCLUDES, ...(chromiumLocalAuBuild ? [] : AUTOGRADE_TRACE_EXCLUDES)]

const nextConfig: NextConfig = {
  // Les tests e2e utilisent leur propre dossier de build : ils peuvent tourner pendant un `next dev` sur le port 3000.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // `next dev` ouvert depuis un téléphone du réseau local (http://192.168.x.x:3000) : sans cela, ses scripts sont bloqués.
  allowedDevOrigins: ['192.168.*.*', '10.*.*.*'],
  // L'éditeur Scratch (public/scratch-editor/) charge certains fichiers à la demande depuis la racine du site
  // (/chunks/…, /static/assets/…) au lieu de son propre dossier : on les y redirige.
  // PGlite : laissé hors du bundle et chargé à la demande par lib/db/client.ts, puis écarté du code déployé.
  serverExternalPackages: ['@electric-sql/pglite'],
  outputFileTracingExcludes: { '/*': traceExcludes },
  // Constante remplacée au build (« 1 » : Chromium local gardé ; « 0 » : écarté) : lib/autograde/enabled.ts refuse
  // l'exécution locale quand Chromium n'est pas dans le code déployé.
  env: { AUTOGRADE_AU_BUILD: chromiumLocalAuBuild ? '1' : '0' },
  async headers() {
    const cache = (value: string) => [{ key: 'Cache-Control', value }]
    return [
      // Toutes les pages : pas d'affichage dans le cadre d'un autre site (l'éditeur Scratch est une iframe de même
      // origine, donc permise), pas d'adresse complète transmise aux autres sites, pas de type de fichier deviné.
      {
        source: '/:path*',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      // Service worker de la web app : jamais mis en cache, pour que les mises à jour arrivent tout de suite.
      {
        source: '/sw.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      {
        source: '/sw-click.js',
        headers: [
          { key: 'Content-Type', value: 'application/javascript; charset=utf-8' },
          { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
          { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self'" },
        ],
      },
      // Éditeur Scratch. Fichiers sans empreinte (editor.html, scratch-gui-standalone.js, bibliothèques…) :
      // revérifiés à chaque chargement, pour qu'aucun navigateur ne garde une version périmée (réponse 304 si rien n'a changé).
      { source: '/scratch-editor/:path*', headers: cache('public, max-age=0, must-revalidate') },
      // Morceaux à empreinte dans le nom (540.dc378b43….js, add-backdrop.3d71….jpg) : une nouvelle version change
      // le nom, donc le cache ne peut jamais servir un fichier périmé. Immuables, sans aller-retour.
      ...['/scratch-editor/chunks/:path*', '/scratch-editor/static/assets/:path*', '/chunks/:path*', '/static/assets/:path*']
        .map((source) => ({ source, headers: cache('public, max-age=31536000, immutable') })),
    ]
  },
  async rewrites() {
    return [
      { source: '/chunks/:path*', destination: '/scratch-editor/chunks/:path*' },
      { source: '/static/assets/:path*', destination: '/scratch-editor/static/assets/:path*' },
    ]
  },
}

export default nextConfig
