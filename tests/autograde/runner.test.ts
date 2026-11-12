import fs from 'node:fs'
import { afterAll, describe, expect, it } from 'vitest'
import { closeBrowser } from '@/lib/autograde/runner/browser'
import { runMany, runProject } from '@/lib/autograde/runner/run'
import { makeSb3, sayHello } from './fixtures'

const base = { answers: [], keys: [], durationMs: 3000, seed: 1 }
afterAll(() => closeBrowser())

describe('exécuteur', { timeout: 120_000 }, () => {
  it('relève une parole et termine', async () => {
    const t = await runProject(sayHello(), base)
    expect(t).toMatchObject({ finished: true, timedOut: false, error: null })
    expect(t.says.map((s) => s.text)).toEqual(['Bonjour'])
  })

  it('répond aux questions avec les entrées de test, et coupe une question sans réponse fournie', async () => {
    const ask = makeSb3([[['event_whenflagclicked'], ['sensing_askandwait', { QUESTION: 'Ton prénom ?' }], ['looks_say', { MESSAGE: ['sensing_answer'] }]]])
    const t = await runProject(ask, { ...base, answers: ['Zoé'] })
    expect(t.questions).toEqual([{ sprite: 'Sprite1', text: 'Ton prénom ?', answer: 'Zoé' }])
    expect(t.says.at(-1)?.text).toBe('Zoé')
    const twice = makeSb3([[['event_whenflagclicked'], ['sensing_askandwait', { QUESTION: 'A ?' }], ['sensing_askandwait', { QUESTION: 'B ?' }]]])
    const looped = await runProject(twice, { ...base, answers: ['x'] })
    expect(looped.questions.map((q) => q.answer)).toEqual(['x', 'x']) // les réponses bouclent
    const none = await runProject(ask, { ...base, answers: [] }) // aucune réponse fournie : réponse vide, le programme continue
    expect(none).toMatchObject({ finished: true, timedOut: false })
    expect(none.questions[0].answer).toBe('')
  })

  it('le même hasard pour la même graine, un autre pour une autre graine', async () => {
    const rnd = makeSb3([[['event_whenflagclicked'], ['looks_say', { MESSAGE: ['operator_random', { FROM: 1, TO: 1000000 }] }]]])
    const a = await runProject(rnd, { ...base, seed: 1 })
    const b = await runProject(rnd, { ...base, seed: 1 })
    const c = await runProject(rnd, { ...base, seed: 2 })
    expect(a.says[0].text).toBe(b.says[0].text)
    expect(a.says[0].text).not.toBe(c.says[0].text)
  })

  it('coupe une boucle infinie à la durée, sans attendre la durée réelle', async () => {
    const forever = makeSb3([[['event_whenflagclicked'], ['control_forever', {}, [['motion_turnright', { DEGREES: 1 }]]]]])
    const start = Date.now()
    const t = await runProject(forever, { ...base, durationMs: 20_000 })
    expect(t).toMatchObject({ finished: false, timedOut: true })
    expect(Date.now() - start).toBeLessThan(15_000) // horloge simulée
  })

  it('coupe à la durée une boucle qui attend une touche jamais pressée, sans rien redessiner', async () => {
    const waitKey = makeSb3([[['event_whenflagclicked'], ['control_forever', {}, [['control_if', { CONDITION: ['sensing_keypressed', { KEY_OPTION: 'space' }] }, [['motion_changexby', { DX: 10 }]]]]]]])
    const start = Date.now()
    const t = await runProject(waitKey, { ...base, durationMs: 3000 })
    expect(t).toMatchObject({ finished: false, timedOut: true })
    expect(Date.now() - start).toBeLessThan(30_000)
  })

  it('simule les touches', async () => {
    const keys = makeSb3([[['event_whenkeypressed', { KEY_OPTION: 'space' }], ['motion_changexby', { DX: 10 }]]])
    const t = await runProject(keys, { ...base, keys: [{ key: ' ', times: 3 }] })
    expect(t.sprites[0].x).toBe(30)
  })

  it('relève stylo, costumes et sons', async () => {
    const draw = makeSb3([[['event_whenflagclicked'], ['pen_penDown'], ['motion_movesteps', { STEPS: 50 }], ['motion_turnright', { DEGREES: 90 }], ['motion_movesteps', { STEPS: 50 }],
      ['looks_switchcostumeto', { COSTUME: 'costume2' }], ['sound_play', { SOUND_MENU: 'Meow' }]]])
    const t = await runProject(draw, base)
    expect(t.pen.segments).toBe(2)
    expect(t.costumeChanges.map((c) => c.costume)).toContain('costume2')
    expect(t.sounds.map((s) => s.sound)).toEqual(['Meow'])
  })

  it('arrêt demandé (signal) : exécutions restantes coupées, réponse sans attendre', async () => {
    const forever = makeSb3([[['event_whenflagclicked'], ['control_forever', {}, [['motion_turnright', { DEGREES: 1 }]]]]])
    const start = Date.now()
    const r = await runMany(forever, { answers: [], keys: [], durationMs: 60_000 }, [1, 2, 3, 4, 5], { signal: AbortSignal.timeout(1_500) })
    expect(r.traces).toHaveLength(5)
    expect(r.traces.at(-1)).toMatchObject({ cut: true, timedOut: true })
    expect(Date.now() - start).toBeLessThan(20_000)
    // Déjà arrêté avant de commencer : tout est coupé.
    const done = await runMany(forever, { answers: [], keys: [], durationMs: 3000 }, [1, 2], { signal: AbortSignal.abort() })
    expect(done.traces.map((t) => t.cut)).toEqual([true, true])
  })

  it('stylo remis à zéro à chaque exécution : 6 segments aux 5 exécutions (pas 6, 12, 18…)', async () => {
    const hexagon = makeSb3([[['event_whenflagclicked'], ['pen_penDown'], ['control_repeat', { TIMES: 6 }, [['motion_movesteps', { STEPS: 40 }], ['motion_turnright', { DEGREES: 60 }]]]]])
    const r = await runMany(hexagon, { answers: [], keys: [], durationMs: 3000 })
    expect(r.traces.map((t) => t.pen.segments)).toEqual([6, 6, 6, 6, 6])
    expect(new Set(r.traces.map((t) => t.pen.hash)).size).toBe(1)
  })

  it('5 exécutions identiques pour un programme fixe ; JSON normalisé renvoyé ; .sb2 accepté', async () => {
    const r = await runMany(sayHello(), { answers: [], keys: [], durationMs: 2000 })
    expect(r.traces).toHaveLength(5)
    expect(new Set(r.traces.map((t) => JSON.stringify({ ...t, says: t.says.map((s) => s.text) }))).size).toBe(1)
    expect((r.project as { targets: unknown[] }).targets.length).toBeGreaterThan(1)
    const sb2 = new Uint8Array(fs.readFileSync('tests/fixtures/le-serpent.sb2'))
    expect((await runProject(sb2, base)).error).toBeNull()
  })

  it('signale un projet illisible', async () => {
    expect((await runProject(new Uint8Array([1, 2, 3]), base)).error).not.toBeNull()
  })
})
