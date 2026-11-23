import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { projectFeatures, projectInventory, projectToText, sameProgram, usedData, type ProjectJson } from '@/lib/autograde/project-text'
import { makeSb3 } from './fixtures'

const json = (b: Uint8Array) => JSON.parse(strFromU8(unzipSync(b)['project.json'])) as ProjectJson

describe('projet en texte', () => {
  it('écrit les scripts en pseudo-code français, avec indentation des boucles', () => {
    const p = json(makeSb3([[['event_whenflagclicked'], ['control_repeat', { TIMES: 4 }, [['motion_movesteps', { STEPS: 100 }], ['motion_turnright', { DEGREES: 90 }]]], ['looks_say', { MESSAGE: 'Fini' }]]]))
    expect(projectToText(p)).toContain([
      '# Lutin : Sprite1 — script 1',
      'quand le drapeau vert est cliqué',
      'répéter 4 fois',
      '  avancer de 100 pas',
      '  tourner à droite de 90 degrés',
      'dire « Fini »',
    ].join('\n'))
  })

  it('écrit les blocs inconnus avec leur opcode et leurs entrées', () => {
    const p = json(makeSb3([[['event_whenflagclicked'], ['music_playDrumForBeats', { DRUM: 1, BEATS: 0.25 }]]]))
    expect(projectToText(p)).toContain('music_playDrumForBeats(DRUM: 1, BEATS: 0.25)')
  })

  it('décrit costumes et sons sans les fichiers', () => {
    const inv = projectInventory(json(makeSb3([])))
    expect(inv).toMatch(/Sprite1 — costumes : costume1, costume2 ; sons : Meow/)
  })

  it('détecte aléatoire et entrées, et compte les scripts', () => {
    expect(projectFeatures(json(makeSb3([[['event_whenflagclicked'], ['looks_say', { MESSAGE: ['operator_random', { FROM: 1, TO: 6 }] }]]]))))
      .toEqual({ usesRandom: true, usesInput: false, scriptCount: 1 })
    expect(projectFeatures(json(makeSb3([[['event_whenkeypressed', { KEY_OPTION: 'space' }], ['motion_changexby', { DX: 10 }]]]))).usesInput).toBe(true)
    expect(projectFeatures(json(makeSb3([[['event_whenflagclicked'], ['sensing_askandwait', { QUESTION: '?' }]]]))).usesInput).toBe(true)
    expect(projectFeatures(json(makeSb3([]))).scriptCount).toBe(0)
  })

  describe('blocs non utilisés (jamais exécutés)', () => {
    const good: Parameters<typeof makeSb3>[0] = [[['event_whenflagclicked'], ['looks_say', { MESSAGE: 'Bonjour' }]]]
    const withJunk: Parameters<typeof makeSb3>[0] = [
      ...good,
      [['motion_movesteps', { STEPS: 10 }], ['looks_say', { MESSAGE: ['operator_random', { FROM: 1, TO: 6 }] }]], // pile sans chapeau
      [['sensing_askandwait', { QUESTION: 'Ton nom ?' }]], // bloc seul
      [['event_whenkeypressed', { KEY_OPTION: 'space' }]], // chapeau vide
    ]

    it('ne les écrit pas dans le texte envoyé à l’IA', () => {
      const text = projectToText(json(makeSb3(withJunk)))
      expect(text).toBe(projectToText(json(makeSb3(good))))
      expect(text).not.toMatch(/avancer|demander|aléatoire|touche/)
    })

    it('ne les compte ni comme hasard, ni comme entrée, ni comme script', () => {
      expect(projectFeatures(json(makeSb3(withJunk)))).toEqual({ usesRandom: false, usesInput: false, scriptCount: 1 })
      expect(projectFeatures(json(makeSb3([[['event_whenflagclicked']], [['motion_movesteps', { STEPS: 10 }]]]))).scriptCount).toBe(0)
    })

    it('ajoutés au projet de départ, il reste identique au départ', () => {
      expect(sameProgram(json(makeSb3(withJunk)), json(makeSb3(good)))).toBe(true)
    })

    it('ignore un bloc personnalisé jamais appelé, garde celui qui est appelé (même indirectement)', () => {
      const block = (o: Record<string, unknown>) => ({ next: null, parent: null, inputs: {}, fields: {}, topLevel: false, ...o })
      const def = (id: string, code: string, body: string) => ({
        [id]: block({ opcode: 'procedures_definition', next: body, topLevel: true, x: 0, y: 0, inputs: { custom_block: [1, `${id}p`] } }),
        [`${id}p`]: block({ opcode: 'procedures_prototype', parent: id, shadow: true, mutation: { proccode: code } }),
      })
      const call = (id: string, code: string, parent: string) => ({ [id]: block({ opcode: 'procedures_call', parent, mutation: { proccode: code } }) })
      const p = json(makeSb3([]))
      p.targets[1].blocks = {
        f: block({ opcode: 'event_whenflagclicked', next: 'c1', topLevel: true, x: 0, y: 0 }), ...call('c1', 'carré', 'f'),
        ...def('d1', 'carré', 'c2'), ...call('c2', 'côté', 'd1'),
        ...def('d2', 'côté', 's1'), s1: block({ opcode: 'motion_movesteps', parent: 'd2', inputs: { STEPS: [1, [4, '50']] } }),
        ...def('d3', 'inutile', 'r1'), r1: block({ opcode: 'sensing_askandwait', parent: 'd3', inputs: { QUESTION: [1, [10, '?']] } }),
      } as never
      const text = projectToText(p)
      expect(text).toContain('définir carré')
      expect(text).toContain('définir côté')
      expect(text).not.toContain('inutile')
      expect(projectFeatures(p)).toEqual({ usesRandom: false, usesInput: false, scriptCount: 3 })
    })
  })

  it('repère les variables et listes utilisées par les blocs exécutés, et seulement elles', () => {
    const p = json(makeSb3([
      [['event_whenflagclicked'], ['data_setvariableto', { VARIABLE: 'score', VALUE: 3 }], ['data_changevariableby', { VARIABLE: 'n', VARIABLE_REPORTER: 'vies' }]],
      [['data_setvariableto', { VARIABLE: 'truc', VALUE: 1 }]], // pile sans chapeau : jamais exécutée
    ], { variables: ['score', 'vies', 'n', 'truc', 'inutile'] }))
    // « n » devient une variable du lutin (clé « Sprite1.n » dans les traces).
    const [stage, sprite] = p.targets
    sprite.variables['var-n'] = stage.variables['var-n']
    delete stage.variables['var-n']
    stage.lists = { 'liste-1': ['courses', []], 'liste-2': ['vide', []] }
    sprite.blocks.l = { opcode: 'data_addtolist', next: null, parent: 'b3', inputs: { ITEM: [1, [10, 'pain']] }, fields: { LIST: ['courses', 'liste-1'] }, topLevel: false }
    ;(sprite.blocks.b3 as { next: string }).next = 'l'
    expect([...usedData(p)].sort()).toEqual(['Sprite1.n', 'courses', 'score', 'vies'])
  })

  it('reconnaît un programme identique malgré des identifiants différents', () => {
    const s: Parameters<typeof makeSb3>[0] = [[['event_whenflagclicked'], ['looks_say', { MESSAGE: 'A' }]]]
    expect(sameProgram(json(makeSb3(s)), json(makeSb3(s)))).toBe(true)
    expect(sameProgram(json(makeSb3(s)), json(makeSb3([[['event_whenflagclicked'], ['looks_say', { MESSAGE: 'B' }]]])))).toBe(false)
  })
})
