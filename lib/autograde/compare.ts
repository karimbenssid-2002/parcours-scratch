import type { RunTrace } from './runner/types'

export function normalizeTrace(t: RunTrace): string {
  return JSON.stringify({
    finished: t.finished, timedOut: t.timedOut, error: t.error,
    says: t.says.map((s) => [s.sprite, s.text]), questions: t.questions.map((q) => [q.sprite, q.text, q.answer]),
    variables: Object.entries(t.variables).sort(), lists: Object.entries(t.lists).sort(),
    sprites: t.sprites.map((s) => [s.name, Math.round(s.x), Math.round(s.y), Math.round(s.direction), s.visible, s.costume, Math.round(s.size)]),
    costumeChanges: t.costumeChanges.map((c) => [c.sprite, c.costume]), sounds: t.sounds.map((s) => [s.sprite, s.sound]),
    pen: [t.pen.segments, t.pen.hash],
  })
}

export const sameTraces = (a: RunTrace[], b: RunTrace[]) =>
  a.length === b.length && a.every((t, i) => normalizeTrace(t) === normalizeTrace(b[i]))

const cap = <T>(list: T[], n = 40) => (list.length > n ? [...list.slice(0, n), `… (${list.length - n} de plus)`] : list)

export function summarizeTraces(traces: RunTrace[]): string {
  return traces.map((t, i) => [
    `## Exécution ${i + 1} — ${t.error ? `erreur : ${t.error}` : t.timedOut ? 'coupé après la durée (le programme ne s’arrête pas)' : 'terminé'}`,
    `Paroles : ${cap(t.says.map((s) => `${s.sprite} : « ${s.text} »`)).join(' | ') || 'aucune'}`,
    `Questions : ${cap(t.questions.map((q) => `${q.sprite} : « ${q.text} » → « ${q.answer} »`)).join(' | ') || 'aucune'}`,
    `Costumes : ${cap(t.costumeChanges.map((c) => `${c.sprite} → ${c.costume}`)).join(' | ') || 'aucun changement'}`,
    `Sons : ${cap(t.sounds.map((s) => `${s.sprite} : ${s.sound}`)).join(' | ') || 'aucun'}`,
    `Variables : ${Object.entries(t.variables).map(([k, v]) => `${k} = ${v}`).join(', ') || 'aucune'}`,
    `Lutins à la fin : ${t.sprites.map((s) => `${s.name} (x ${s.x}, y ${s.y}, direction ${s.direction}, ${s.visible ? 'visible' : 'caché'}, costume ${s.costume})`).join(' ; ')}`,
    `Stylo : ${t.pen.segments} tracé(s)${t.pen.bbox ? `, zone ${t.pen.bbox.map(Math.round).join(', ')}` : ''}`,
  ].join('\n')).join('\n\n')
}

export function differences(student: RunTrace[], solution: RunTrace[]): string[] {
  const out = new Set<string>()
  student.forEach((s, i) => {
    const r = solution[i]
    if (!r) return
    const pick = (t: RunTrace) => JSON.parse(normalizeTrace(t)) as Record<string, unknown>
    const a = pick(s), b = pick(r)
    const labels: Record<string, string> = { says: 'Paroles différentes', questions: 'Questions différentes', variables: 'Variables différentes', lists: 'Listes différentes', sprites: 'Position ou état des lutins différents', costumeChanges: 'Changements de costume différents', sounds: 'Sons joués différents', pen: 'Tracé du stylo différent' }
    for (const [k, label] of Object.entries(labels)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.add(`${label} de la solution.`)
    if (s.timedOut && !r.timedOut) out.add('Le programme ne s’arrête pas alors que la solution s’arrête.')
  })
  return [...out]
}
