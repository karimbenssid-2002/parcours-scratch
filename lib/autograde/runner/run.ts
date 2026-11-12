import 'server-only'
import crypto from 'node:crypto'
import { openRunnerPage } from './browser'
import type { RunOptions, RunResult, RunTrace } from './types'

export { DEFAULT_ANSWERS, DEFAULT_KEYS } from './defaults'
const STEP_MS = 100
type Raw = Omit<RunTrace, 'finished' | 'timedOut' | 'error' | 'pen'> & { penParts: string[]; penBbox: [number, number, number, number] | null; penLines: number }
type W = { runner: { load(b: string): Promise<string | null>; start(s: number, a: string[]): void; key(k: string, d: boolean): void; running(): boolean; finish(): Raw; projectJson(): string } }

// Limite en temps réel d'une exécution (le temps du programme, lui, est simulé et bien plus rapide).
const realLimitMs = (durationMs: number) => 20_000 + durationMs
const TIMED_OUT = Symbol('timeout')

const empty = (error: string): RunTrace => ({ finished: false, timedOut: false, error, says: [], questions: [], variables: {}, lists: {}, sprites: [], costumeChanges: [], sounds: [], pen: { segments: 0, bbox: null, hash: '' } })

export type RunControl = { signal?: AbortSignal }

async function execute(bytes: Uint8Array, options: RunOptions[], wantProject: boolean, signal?: AbortSignal): Promise<RunResult> {
  const page = await openRunnerPage()
  // Arrêt demandé de l'extérieur (échéance globale du service, client parti) : traité comme la limite en temps réel.
  const aborted = new Promise<typeof TIMED_OUT>((resolve) => {
    if (signal?.aborted) resolve(TIMED_OUT)
    else signal?.addEventListener('abort', () => resolve(TIMED_OUT), { once: true })
  })
  try {
    const base64 = Buffer.from(bytes).toString('base64')
    const traces: RunTrace[] = []
    let project: unknown | null = null
    for (const [index, opt] of options.entries()) {
      // Un programme qui monopolise le moteur (bloc « sans rafraîchissement d'écran » qui boucle…) ne doit jamais bloquer
      // le serveur : passé la limite, le contexte du navigateur est fermé et les exécutions restantes sont notées coupées.
      let timer: NodeJS.Timeout | undefined
      const deadline = new Promise<typeof TIMED_OUT>((resolve) => { timer = setTimeout(() => resolve(TIMED_OUT), realLimitMs(opt.durationMs)) })
      const outcome = signal?.aborted ? TIMED_OUT : await Promise.race([runOnce(opt), deadline, aborted]).finally(() => clearTimeout(timer))
      if (outcome === TIMED_OUT) {
        await page.context().close().catch(() => {})
        const cut: RunTrace = { ...empty(''), error: null, timedOut: true, cut: true }
        for (let i = index; i < options.length; i++) traces.push(cut)
        return { project, traces }
      }
      traces.push(outcome)
    }
    return { project, traces }

    async function runOnce(opt: RunOptions): Promise<RunTrace> {
      const error = await page.evaluate((b) => (window as unknown as W).runner.load(b), base64)
      if (error) return empty(error)
      await page.clock.runFor(500)
      if (wantProject && project === null) project = JSON.parse(await page.evaluate(() => (window as unknown as W).runner.projectJson()))
      await page.evaluate(([s, a]) => (window as unknown as W).runner.start(s as number, a as string[]), [opt.seed, opt.answers] as const)
      // Touches : une pression (bas puis haut) toutes les 500 ms de temps simulé, dans l'ordre.
      const presses = opt.keys.flatMap((k) => Array.from({ length: Math.max(0, Math.min(k.times, 50)) }, () => (k.key === 'space' ? ' ' : k.key)))
      let elapsed = 0, finished = false
      while (elapsed < opt.durationMs) {
        const press = presses[Math.floor(elapsed / 500)]
        if (press !== undefined && elapsed % 500 === 0) await page.evaluate((k) => (window as unknown as W).runner.key(k, true), press)
        await page.clock.runFor(STEP_MS)
        if (press !== undefined && elapsed % 500 === 0) await page.evaluate((k) => (window as unknown as W).runner.key(k, false), press)
        elapsed += STEP_MS
        const pendingKeys = presses.length * 500 > elapsed
        if (!pendingKeys && !(await page.evaluate(() => (window as unknown as W).runner.running()))) { finished = true; break }
      }
      const raw = await page.evaluate(() => (window as unknown as W).runner.finish())
      return {
        finished, timedOut: !finished, error: null,
        says: raw.says, questions: raw.questions, variables: raw.variables, lists: raw.lists, sprites: raw.sprites,
        costumeChanges: raw.costumeChanges, sounds: raw.sounds,
        pen: { segments: raw.penLines, bbox: raw.penBbox, hash: crypto.createHash('sha1').update(raw.penParts.join(';')).digest('hex').slice(0, 16) },
      }
    }
  } finally {
    await page.context().close().catch(() => {})
  }
}

export async function runProject(bytes: Uint8Array, options: RunOptions): Promise<RunTrace> {
  return (await execute(bytes, [options], false)).traces[0]
}

/** Exécutions avec les graines données ; `control.signal` coupe les exécutions restantes (traces « cut »). */
export async function runMany(bytes: Uint8Array, base: Omit<RunOptions, 'seed'>, seeds = [1, 2, 3, 4, 5], control: RunControl = {}): Promise<RunResult> {
  return execute(bytes, seeds.map((seed) => ({ ...base, seed })), true, control.signal)
}
