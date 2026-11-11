import { strFromU8, unzipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { projectFeatures, projectInventory, projectToText, sameProgram, type ProjectJson } from '@/lib/autograde/project-text'
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

  it('reconnaît un programme identique malgré des identifiants différents', () => {
    const s: Parameters<typeof makeSb3>[0] = [[['event_whenflagclicked'], ['looks_say', { MESSAGE: 'A' }]]]
    expect(sameProgram(json(makeSb3(s)), json(makeSb3(s)))).toBe(true)
    expect(sameProgram(json(makeSb3(s)), json(makeSb3([[['event_whenflagclicked'], ['looks_say', { MESSAGE: 'B' }]]])))).toBe(false)
  })
})
