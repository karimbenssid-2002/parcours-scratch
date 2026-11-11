import fs from 'node:fs'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

type Input = string | number | Block
export type Block = [opcode: string, inputs?: Record<string, Input>, substack?: Block[], substack2?: Block[]]

const FIELD_INPUTS: Record<string, string> = { // opcode → nom du champ (menus)
  event_whenkeypressed: 'KEY_OPTION', looks_switchcostumeto: 'COSTUME', sound_play: 'SOUND_MENU',
  sensing_keypressed: 'KEY_OPTION', sensing_touchingobject: 'TOUCHINGOBJECTMENU', data_setvariableto: 'VARIABLE',
  data_changevariableby: 'VARIABLE',
}
const SHADOW_MENUS: Record<string, [string, string]> = { // opcode → [opcode du menu, champ]
  looks_switchcostumeto: ['looks_costume', 'COSTUME'], sound_play: ['sound_sounds_menu', 'SOUND_MENU'],
  sensing_keypressed: ['sensing_keyoptions', 'KEY_OPTION'], sensing_touchingobject: ['sensing_touchingobjectmenu', 'TOUCHINGOBJECTMENU'],
}

/** Projet .sb3 dont le lutin « Sprite1 » porte les scripts donnés ; variables globales créées à la demande. */
export function makeSb3(scripts: Block[][], options: { variables?: string[] } = {}): Uint8Array {
  const files = unzipSync(new Uint8Array(fs.readFileSync('scratch-editor/blank.sb3')))
  const project = JSON.parse(strFromU8(files['project.json']))
  const stage = project.targets.find((t: { isStage: boolean }) => t.isStage)
  const sprite = project.targets.find((t: { isStage: boolean }) => !t.isStage)
  for (const name of options.variables ?? []) stage.variables[`var-${name}`] = [name, 0]
  const blocks: Record<string, unknown> = {}
  let n = 0
  const id = () => `b${++n}`
  const varId = (name: string) => `var-${name}`

  function addBlock(block: Block, parent: string | null, topLevel: boolean, x = 0): string {
    const [opcode, inputs = {}, sub, sub2] = block
    const me = id()
    const json: Record<string, unknown> = { opcode, next: null, parent, inputs: {}, fields: {}, shadow: false, topLevel }
    if (topLevel) Object.assign(json, { x, y: 0 })
    blocks[me] = json
    for (const [name, value] of Object.entries(inputs)) {
      if (name === FIELD_INPUTS[opcode] && !SHADOW_MENUS[opcode]) {
        ;(json.fields as Record<string, unknown>)[name] = opcode.startsWith('data_') ? [value, varId(String(value))] : [value, null]
      } else if (SHADOW_MENUS[opcode] && name === SHADOW_MENUS[opcode][1]) {
        const menu = id()
        blocks[menu] = { opcode: SHADOW_MENUS[opcode][0], next: null, parent: me, inputs: {}, fields: { [name]: [value, null] }, shadow: true, topLevel: false }
        ;(json.inputs as Record<string, unknown>)[name === 'SOUND_MENU' ? 'SOUND_MENU' : name === 'COSTUME' ? 'COSTUME' : name] = [1, menu]
      } else if (Array.isArray(value)) {
        ;(json.inputs as Record<string, unknown>)[name] = [3, addBlock(value, me, false), [10, '']]
      } else if (name === 'VARIABLE_REPORTER') {
        ;(json.inputs as Record<string, unknown>).VALUE = [3, [12, String(value), varId(String(value))], [10, '']]
      } else {
        ;(json.inputs as Record<string, unknown>)[name] = [1, [typeof value === 'number' ? 4 : 10, String(value)]]
      }
    }
    if (sub) (json.inputs as Record<string, unknown>).SUBSTACK = [2, chain(sub, me)]
    if (sub2) (json.inputs as Record<string, unknown>).SUBSTACK2 = [2, chain(sub2, me)]
    return me
  }
  function chain(list: Block[], parent: string | null, topLevel = false, x = 0): string {
    let first = '', prev: string | null = null
    list.forEach((b, i) => {
      const me = addBlock(b, prev ?? parent, topLevel && i === 0, x)
      if (prev) (blocks[prev] as { next: string | null }).next = me
      else first = me
      prev = me
    })
    return first
  }
  scripts.forEach((s, i) => chain(s, null, true, i * 300))
  sprite.blocks = blocks
  files['project.json'] = strToU8(JSON.stringify(project))
  return zipSync(files)
}

export const sayHello = () => makeSb3([[['event_whenflagclicked'], ['looks_say', { MESSAGE: 'Bonjour' }]]])
