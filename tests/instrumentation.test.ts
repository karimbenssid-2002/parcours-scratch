import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const root = path.resolve(__dirname, '..')
const sources = (dir: string): string[] =>
  fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? sources(path.join(dir, e.name)) : /\.(ts|tsx)$/.test(e.name) ? [path.join(dir, e.name)] : [])
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8')

describe('démarrage du serveur', () => {
  it('aucune boucle de correction permanente : ni instrumentation.ts, ni worker, ni setInterval côté serveur', () => {
    // Sur Vercel aucune boucle ne survit à la réponse : la file est vidée par des fonctions lancées avec after().
    for (const f of ['instrumentation.ts', 'instrumentation.js', 'lib/autograde/worker.ts']) expect(fs.existsSync(path.join(root, f))).toBe(false)
    // Les composants du navigateur (« use client ») gardent leurs minuteries (sauvegarde, suivi de l'état).
    const server = [...sources('lib'), ...sources('app')].filter((f) => !/^\s*['"]use client['"]/.test(read(f)))
    expect(server.filter((f) => /setInterval\s*\(|ensureWorker/.test(read(f)))).toEqual([])
  })
})
