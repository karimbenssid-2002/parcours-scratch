import 'server-only'
import fs from 'node:fs/promises'
import path from 'node:path'
import type { Browser, Page } from 'playwright-core'

const ORIGIN = 'http://runner.local'
const ROOT = path.join(process.cwd(), 'public', 'scratch-editor')
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.hex': 'application/octet-stream' }
const store = globalThis as unknown as { __autogradeBrowser?: Promise<Browser>; __autogradeSpare?: Promise<Page> }

/* playwright-core n'est chargé qu'au premier lancement de Chromium : construit sans correction automatique (en ligne),
 * il est écarté des fichiers déployés (next.config.ts), et un import statique ferait échouer le chargement des pages
 * qui importent ce module (actions de revue et d'activité) avant même tout appel. */
function browser(): Promise<Browser> {
  store.__autogradeBrowser ??= import('playwright-core').then(({ chromium }) => chromium.launch({ headless: true })).then((b) => {
    b.on('disconnected', () => { store.__autogradeBrowser = undefined }) // relancé au prochain besoin s'il plante
    return b
  })
  return store.__autogradeBrowser
}

/** Prépare en arrière-plan la page de réserve (une seule à la fois). */
function prepareSpare(): void {
  const spare = openFreshPage()
  store.__autogradeSpare = spare
  spare.catch(() => { if (store.__autogradeSpare === spare) store.__autogradeSpare = undefined })
}

/**
 * Page d'exécution neuve. Charger l'éditeur prend plusieurs secondes : une page de réserve est gardée prête,
 * donnée au prochain appel puis aussitôt remplacée. Chaque exécution a toujours sa propre page (jamais réutilisée).
 */
export async function openRunnerPage(): Promise<Page> {
  const ready = store.__autogradeSpare
  prepareSpare()
  if (ready) {
    try {
      const page = await ready
      if (!page.isClosed()) return page
    } catch { /* réserve inutilisable (navigateur relancé…) : page neuve ci-dessous */ }
  }
  return openFreshPage()
}

/** Page d'exécution : seuls les fichiers de public/scratch-editor sont servis, tout le reste est bloqué (pas de réseau). */
async function openFreshPage(): Promise<Page> {
  const context = await (await browser()).newContext({ viewport: { width: 480, height: 360 } })
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin !== ORIGIN) return route.abort()
    // L'éditeur charge certains fichiers à la racine (/chunks/…, /static/assets/…) : même redirection que next.config.ts.
    const rel = decodeURIComponent(url.pathname).replace(/^\/scratch-editor\//, '/').replace(/^\/static\/assets\//, '/static/assets/')
    const file = path.normalize(path.join(ROOT, rel))
    if (!file.startsWith(ROOT)) return route.abort()
    try {
      return route.fulfill({ body: await fs.readFile(file), contentType: TYPES[path.extname(file)] ?? 'application/octet-stream' })
    } catch {
      return route.fulfill({ status: 404, body: '' })
    }
  })
  try {
    const page = await context.newPage()
    await page.clock.install({ time: 0 })
    await page.goto(`${ORIGIN}/scratch-editor/runner.html`)
    await page.clock.runFor(5_000) // chargement de l'éditeur (temps simulé)
    await page.waitForFunction(() => (window as unknown as { runner?: { ready: boolean } }).runner?.ready === true, null, { timeout: 60_000 })
    return page
  } catch (e) {
    await context.close().catch(() => {}) // jamais de contexte orphelin si la page d'exécution ne se charge pas
    throw e
  }
}

export async function closeBrowser(): Promise<void> {
  const b = store.__autogradeBrowser
  const spare = store.__autogradeSpare
  store.__autogradeBrowser = undefined
  store.__autogradeSpare = undefined
  await spare?.then((p) => p.context().close()).catch(() => {})
  if (b) await (await b).close()
}
