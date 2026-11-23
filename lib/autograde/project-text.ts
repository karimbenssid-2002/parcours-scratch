// Projet Scratch (JSON sb3, aussi pour un .sb2 normalisé par la VM) → pseudo-code français lisible par l'IA.
// Seuls les blocs, et les noms des costumes et des sons, sont décrits : jamais les fichiers, identifiants ni commentaires.

export type BlockObject = {
  opcode: string; next: string | null; parent: string | null
  inputs: Record<string, unknown[]>; fields: Record<string, unknown[]>
  topLevel: boolean; shadow?: boolean; x?: number; y?: number
  mutation?: { proccode?: string; argumentnames?: string }
}
export type BlockJson = BlockObject | unknown[] // tableau : variable ou liste posée seule sur le plan de travail
export type TargetJson = {
  isStage: boolean; name: string; blocks: Record<string, BlockJson>
  costumes: { name: string }[]; sounds: { name: string }[]
  variables: Record<string, [string, unknown]>; lists: Record<string, [string, unknown[]]>
}
export type ProjectJson = { targets: TargetJson[] }

const PHRASES: Record<string, string> = {
  // Événements
  event_whenflagclicked: 'quand le drapeau vert est cliqué',
  event_whenkeypressed: 'quand la touche {KEY_OPTION} est pressée',
  event_whenthisspriteclicked: 'quand ce lutin est cliqué',
  event_whenstageclicked: 'quand la scène est cliquée',
  event_whenbackdropswitchesto: 'quand l’arrière-plan bascule sur {BACKDROP}',
  event_whenbroadcastreceived: 'quand je reçois {BROADCAST_OPTION}',
  event_broadcast: 'envoyer à tous {BROADCAST_INPUT}',
  event_broadcastandwait: 'envoyer à tous {BROADCAST_INPUT} et attendre',
  event_whengreaterthan: 'quand {WHENGREATERTHANMENU} > {VALUE}',
  // Mouvement
  motion_movesteps: 'avancer de {STEPS} pas',
  motion_turnright: 'tourner à droite de {DEGREES} degrés',
  motion_turnleft: 'tourner à gauche de {DEGREES} degrés',
  motion_gotoxy: 'aller à x: {X} y: {Y}',
  motion_goto: 'aller à {TO}',
  motion_glidesecstoxy: 'glisser en {SECS} secondes à x: {X} y: {Y}',
  motion_glideto: 'glisser en {SECS} secondes à {TO}',
  motion_changexby: 'ajouter {DX} à x',
  motion_changeyby: 'ajouter {DY} à y',
  motion_setx: 'mettre x à {X}',
  motion_sety: 'mettre y à {Y}',
  motion_pointindirection: 's’orienter à {DIRECTION}',
  motion_pointtowards: 's’orienter vers {TOWARDS}',
  motion_ifonedgebounce: 'rebondir si le bord est atteint',
  motion_setrotationstyle: 'fixer le sens de rotation {STYLE}',
  motion_xposition: 'abscisse x',
  motion_yposition: 'ordonnée y',
  motion_direction: 'direction',
  // Apparence
  looks_say: 'dire {MESSAGE}',
  looks_sayforsecs: 'dire {MESSAGE} pendant {SECS} secondes',
  looks_think: 'penser {MESSAGE}',
  looks_thinkforsecs: 'penser {MESSAGE} pendant {SECS} secondes',
  looks_switchcostumeto: 'basculer sur le costume {COSTUME}',
  looks_nextcostume: 'costume suivant',
  looks_switchbackdropto: 'basculer sur l’arrière-plan {BACKDROP}',
  looks_nextbackdrop: 'arrière-plan suivant',
  looks_show: 'montrer',
  looks_hide: 'cacher',
  looks_changesizeby: 'ajouter {CHANGE} à la taille',
  looks_setsizeto: 'mettre la taille à {SIZE} % de la taille initiale',
  looks_changeeffectby: 'ajouter {CHANGE} à l’effet {EFFECT}',
  looks_seteffectto: 'mettre l’effet {EFFECT} à {VALUE}',
  looks_cleargraphiceffects: 'annuler les effets graphiques',
  looks_gotofrontback: 'aller à l’arrière-plan {FRONT_BACK}',
  looks_costumenumbername: 'costume {NUMBER_NAME}',
  looks_size: 'taille',
  // Son
  sound_play: 'jouer le son {SOUND_MENU}',
  sound_playuntildone: 'jouer le son {SOUND_MENU} jusqu’au bout',
  sound_stopallsounds: 'arrêter tous les sons',
  sound_changevolumeby: 'ajouter {VOLUME} au volume',
  sound_setvolumeto: 'mettre le volume à {VOLUME} %',
  // Stylo
  pen_clear: 'effacer tout',
  pen_stamp: 'estampiller',
  pen_penDown: 'stylo en position d’écriture',
  pen_penUp: 'relever le stylo',
  pen_setPenColorToColor: 'mettre la couleur du stylo à {COLOR}',
  pen_changePenColorParamBy: 'ajouter {VALUE} à {COLOR_PARAM} du stylo',
  pen_setPenColorParamTo: 'mettre {COLOR_PARAM} du stylo à {VALUE}',
  pen_changePenSizeBy: 'ajouter {SIZE} à la taille du stylo',
  pen_setPenSizeTo: 'mettre la taille du stylo à {SIZE}',
  // Contrôle
  control_wait: 'attendre {DURATION} secondes',
  control_repeat: 'répéter {TIMES} fois',
  control_forever: 'répéter indéfiniment',
  control_if: 'si {CONDITION} alors',
  control_if_else: 'si {CONDITION} alors',
  control_wait_until: 'attendre jusqu’à ce que {CONDITION}',
  control_repeat_until: 'répéter jusqu’à ce que {CONDITION}',
  control_stop: 'stop {STOP_OPTION}',
  control_start_as_clone: 'quand je commence comme un clone',
  control_create_clone_of: 'créer un clone de {CLONE_OPTION}',
  control_delete_this_clone: 'supprimer ce clone',
  // Capteurs
  sensing_touchingobject: 'touche {TOUCHINGOBJECTMENU} ?',
  sensing_touchingcolor: 'couleur {COLOR} touchée ?',
  sensing_coloristouchingcolor: 'couleur {COLOR} touche {COLOR2} ?',
  sensing_distanceto: 'distance de {DISTANCETOMENU}',
  sensing_askandwait: 'demander {QUESTION} et attendre',
  sensing_answer: 'réponse',
  sensing_keypressed: 'touche {KEY_OPTION} pressée ?',
  sensing_mousedown: 'souris pressée ?',
  sensing_mousex: 'souris x',
  sensing_mousey: 'souris y',
  sensing_timer: 'chronomètre',
  sensing_resettimer: 'réinitialiser le chronomètre',
  sensing_of: '{PROPERTY} de {OBJECT}',
  sensing_current: '{CURRENTMENU} actuel',
  sensing_dayssince2000: 'jours depuis 2000',
  sensing_loudness: 'volume sonore',
  sensing_username: 'nom d’utilisateur',
  // Opérateurs
  operator_add: '({NUM1} + {NUM2})',
  operator_subtract: '({NUM1} - {NUM2})',
  operator_multiply: '({NUM1} * {NUM2})',
  operator_divide: '({NUM1} / {NUM2})',
  operator_random: 'nombre aléatoire entre {FROM} et {TO}',
  operator_gt: '({OPERAND1} > {OPERAND2})',
  operator_lt: '({OPERAND1} < {OPERAND2})',
  operator_equals: '({OPERAND1} = {OPERAND2})',
  operator_and: '({OPERAND1} et {OPERAND2})',
  operator_or: '({OPERAND1} ou {OPERAND2})',
  operator_not: 'non {OPERAND}',
  operator_join: 'regrouper {STRING1} et {STRING2}',
  operator_letter_of: 'lettre {LETTER} de {STRING}',
  operator_length: 'longueur de {STRING}',
  operator_contains: '{STRING1} contient {STRING2} ?',
  operator_mod: '({NUM1} modulo {NUM2})',
  operator_round: 'arrondi de {NUM}',
  operator_mathop: '{OPERATOR} de {NUM}',
  // Variables et listes
  data_setvariableto: 'mettre {VARIABLE} à {VALUE}',
  data_changevariableby: 'ajouter {VALUE} à {VARIABLE}',
  data_showvariable: 'montrer la variable {VARIABLE}',
  data_hidevariable: 'cacher la variable {VARIABLE}',
  data_addtolist: 'ajouter {ITEM} à {LIST}',
  data_deleteoflist: 'supprimer l’élément {INDEX} de {LIST}',
  data_deletealloflist: 'supprimer tous les éléments de {LIST}',
  data_insertatlist: 'insérer {ITEM} en position {INDEX} de {LIST}',
  data_replaceitemoflist: 'remplacer l’élément {INDEX} de {LIST} par {ITEM}',
  data_itemoflist: 'élément {INDEX} de {LIST}',
  data_itemnumoflist: 'position de {ITEM} dans {LIST}',
  data_lengthoflist: 'longueur de {LIST}',
  data_listcontainsitem: '{LIST} contient {ITEM} ?',
}

const RANDOM = new Set(['operator_random'])
const INPUT = new Set([
  'sensing_askandwait', 'sensing_keypressed', 'event_whenkeypressed', 'sensing_mousex', 'sensing_mousey', 'sensing_mousedown',
  'event_whenthisspriteclicked', 'event_whenstageclicked', 'sensing_loudness', 'sensing_answer',
])
// Chapeaux : seul un script qui commence par l'un d'eux peut s'exécuter (extensions comprises : videoSensing_whenMotionGreaterThan…).
const HATS = /^[a-zA-Z0-9]+_when|^control_start_as_clone$|^procedures_definition$/

const isBlock = (b: BlockJson | undefined): b is BlockObject => !!b && !Array.isArray(b) && typeof b === 'object'

function reporter(blocks: Record<string, BlockJson>, id: string): string {
  const b = blocks[id]
  if (!isBlock(b)) return Array.isArray(b) ? String(b[1]) : '?'
  if (b.shadow) {
    const field = Object.values(b.fields)[0]
    return field ? String(field[0]) : '?'
  }
  const text = phrase(blocks, b)
  return /^[(«]/.test(text) ? text : `(${text})`
}

function inputValue(blocks: Record<string, BlockJson>, input: unknown[] | undefined): string {
  if (!input) return '?'
  const value = input[1]
  if (typeof value === 'string') return reporter(blocks, value)
  if (Array.isArray(value)) {
    const [type, text] = value as [number, unknown]
    if (type === 12) return `(variable ${String(text)})`
    if (type === 13) return `(liste ${String(text)})`
    if (type === 10 || type === 9 || type === 11) return `« ${String(text)} »`
    return String(text)
  }
  return '?'
}

function phrase(blocks: Record<string, BlockJson>, b: BlockObject): string {
  if (b.opcode === 'procedures_definition') return `définir ${definedProc(blocks, b) ?? '?'}`
  if (b.opcode === 'procedures_call') {
    const args = Object.keys(b.inputs).map((k) => inputValue(blocks, b.inputs[k]))
    return `${b.mutation?.proccode ?? 'bloc'}${args.length ? ` (${args.join(', ')})` : ''}`
  }
  if (b.opcode === 'argument_reporter_string_number' || b.opcode === 'argument_reporter_boolean') return String(b.fields.VALUE?.[0] ?? '?')
  if (b.opcode === 'data_variable') return `(variable ${String(b.fields.VARIABLE?.[0])})`
  if (b.opcode === 'data_listcontents') return `(liste ${String(b.fields.LIST?.[0])})`
  const template = PHRASES[b.opcode]
  const value = (name: string) => (b.inputs[name] ? inputValue(blocks, b.inputs[name]) : b.fields[name] ? String(b.fields[name][0]) : '?')
  if (template) return template.replace(/\{(\w+)\}/g, (_, name: string) => value(name))
  const parts = [...Object.keys(b.inputs).filter((n) => !/^SUBSTACK/.test(n)), ...Object.keys(b.fields)].map((n) => `${n}: ${value(n)}`)
  return `${b.opcode}(${parts.join(', ')})`
}

function stack(blocks: Record<string, BlockJson>, firstId: string | null, depth: number, out: string[]): void {
  let id = firstId
  const pad = '  '.repeat(depth)
  while (id) {
    const b = blocks[id]
    if (!isBlock(b)) break
    out.push(pad + phrase(blocks, b))
    const sub = b.inputs.SUBSTACK?.[1]
    if (typeof sub === 'string') stack(blocks, sub, depth + 1, out)
    if (b.opcode === 'control_if_else') {
      out.push(`${pad}sinon`)
      const sub2 = b.inputs.SUBSTACK2?.[1]
      if (typeof sub2 === 'string') stack(blocks, sub2, depth + 1, out)
    }
    id = b.next
  }
}

const scripts = (t: TargetJson) =>
  Object.entries(t.blocks)
    .filter((e): e is [string, BlockObject] => isBlock(e[1]) && e[1].topLevel && !e[1].shadow)
    .sort(([, a], [, b]) => (a.y ?? 0) - (b.y ?? 0) || (a.x ?? 0) - (b.x ?? 0))

const definedProc = (blocks: Record<string, BlockJson>, b: BlockObject) => {
  const proto = blocks[(b.inputs.custom_block?.[1] as string) ?? '']
  return isBlock(proto) ? proto.mutation?.proccode : undefined
}

/**
 * Ce qui peut s'exécuter dans un lutin : les scripts qui commencent par un chapeau suivi d'au moins un bloc, et les blocs
 * qu'ils contiennent. Comme dans Scratch, les piles sans chapeau, les blocs posés seuls, les chapeaux vides et les blocs
 * personnalisés jamais appelés sont ignorés : la correction ne doit pas tenir compte de ce qui traîne sur le plan de travail.
 */
function executable(t: TargetJson): { scripts: [string, BlockObject][]; blocks: BlockObject[] } {
  const heads = scripts(t).filter(([, b]) => HATS.test(b.opcode) && b.next)
  const seen = new Set<string>(), called = new Set<string>(), kept = new Set<string>()
  const visit = (id: string) => {
    const b = t.blocks[id]
    if (seen.has(id) || !isBlock(b)) return
    seen.add(id)
    if (b.opcode === 'procedures_call' && b.mutation?.proccode) called.add(b.mutation.proccode)
    for (const input of Object.values(b.inputs)) for (const ref of input.slice(1)) if (typeof ref === 'string') visit(ref)
    if (b.next) visit(b.next)
  }
  const keep = ([id]: [string, BlockObject]) => { kept.add(id); visit(id) }
  heads.filter(([, b]) => b.opcode !== 'procedures_definition').forEach(keep)
  // Un bloc personnalisé compte s'il est appelé depuis un script gardé, même par l'intermédiaire d'un autre bloc personnalisé.
  const defs = heads.filter(([, b]) => b.opcode === 'procedures_definition')
  for (let grew = true; grew;) {
    grew = false
    for (const d of defs) if (!kept.has(d[0]) && called.has(definedProc(t.blocks, d[1]) ?? '')) { keep(d); grew = true }
  }
  return { scripts: heads.filter(([id]) => kept.has(id)), blocks: [...seen].map((id) => t.blocks[id] as BlockObject) }
}

const title = (t: TargetJson) => (t.isStage ? '# Scène' : `# Lutin : ${t.name}`)

export function projectToText(project: ProjectJson): string {
  const out: string[] = []
  for (const t of project.targets) {
    executable(t).scripts.forEach(([id], i) => {
      out.push(`${title(t)} — script ${i + 1}`)
      stack(t.blocks, id, 0, out)
      out.push('')
    })
  }
  return out.join('\n').trim() || '(aucun script)'
}

export function projectInventory(project: ProjectJson): string {
  return project.targets.map((t) => {
    const list = (items: { name: string }[]) => (items.length ? items.map((i) => i.name).join(', ') : 'aucun')
    return `${t.isStage ? 'Scène' : t.name} — costumes : ${list(t.costumes)} ; sons : ${list(t.sounds)}`
  }).join('\n')
}

export function projectFeatures(project: ProjectJson): { usesRandom: boolean; usesInput: boolean; scriptCount: number } {
  let usesRandom = false, usesInput = false, scriptCount = 0
  for (const t of project.targets) {
    const run = executable(t)
    scriptCount += run.scripts.length
    for (const b of run.blocks) {
      if (RANDOM.has(b.opcode)) usesRandom = true
      if (INPUT.has(b.opcode) || b.opcode.startsWith('videoSensing_')) usesInput = true
    }
  }
  return { usesRandom, usesInput, scriptCount }
}

/**
 * Variables et listes lues ou modifiées par un bloc exécuté, sous la forme des clés des traces d'exécution
 * (« nom » pour la scène, « Lutin.nom » pour un lutin). Une variable créée mais jamais utilisée n'en fait pas partie.
 */
export function usedData(project: ProjectJson): Set<string> {
  const ids = new Set<string>(), keys = new Set<string>()
  for (const t of project.targets) {
    for (const b of executable(t).blocks) {
      for (const f of [b.fields.VARIABLE, b.fields.LIST]) if (typeof f?.[1] === 'string') ids.add(f[1])
      // Variable ou liste posée directement dans une entrée : [12 | 13, nom, identifiant].
      for (const input of Object.values(b.inputs)) {
        for (const v of input.slice(1)) if (Array.isArray(v) && (v[0] === 12 || v[0] === 13) && typeof v[2] === 'string') ids.add(v[2])
      }
      if (b.opcode === 'sensing_of') { // « (score) de (Lutin) » : variable d'un autre lutin, désignée par son nom
        const menu = t.blocks[(b.inputs.OBJECT?.[1] as string) ?? '']
        const object = isBlock(menu) ? String(menu.fields.OBJECT?.[0] ?? '') : ''
        const property = String(b.fields.PROPERTY?.[0] ?? '')
        keys.add(object === '_stage_' ? property : `${object}.${property}`)
      }
    }
  }
  for (const t of project.targets) {
    for (const [id, [name]] of [...Object.entries(t.variables ?? {}), ...Object.entries(t.lists ?? {})]) {
      if (ids.has(id)) keys.add(t.isStage ? name : `${t.name}.${name}`)
    }
  }
  return keys
}

export function sameProgram(a: ProjectJson, b: ProjectJson): boolean {
  return projectToText(a) === projectToText(b) && projectInventory(a) === projectInventory(b)
}
