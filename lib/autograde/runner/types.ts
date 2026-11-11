export type KeyPress = { key: string; times: number }
export type RunOptions = { answers: string[]; keys: KeyPress[]; durationMs: number; seed: number }
export type RunTrace = {
  finished: boolean; timedOut: boolean; error: string | null
  cut?: true // arrêtée par la limite en temps réel (machine surchargée ou programme qui monopolise le moteur)
  says: { sprite: string; text: string; t: number }[]
  questions: { sprite: string; text: string; answer: string }[]
  variables: Record<string, string | number>
  lists: Record<string, (string | number)[]>
  sprites: { name: string; x: number; y: number; direction: number; visible: boolean; costume: string; size: number }[]
  costumeChanges: { sprite: string; costume: string; t: number }[]
  sounds: { sprite: string; sound: string; t: number }[]
  pen: { segments: number; bbox: [number, number, number, number] | null; hash: string }
}
export type RunResult = { project: unknown | null; traces: RunTrace[] } // project = JSON sb3 normalisé (aussi pour un .sb2)
