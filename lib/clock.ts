// Décalage global (globalThis : partagé par les routes et les pages du même processus Next).
const store = globalThis as unknown as { __clockOffsetMs?: number }

/** « Maintenant » pour tout ce qui touche aux échéances. Décalable en e2e uniquement. */
export function now(): Date {
  return new Date(Date.now() + (store.__clockOffsetMs ?? 0))
}

export function setClockOffset(ms: number): void {
  store.__clockOffsetMs = ms
}
