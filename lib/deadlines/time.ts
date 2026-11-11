export const SCHOOL_TZ = 'Africa/Casablanca'

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: SCHOOL_TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

/** Décalage (ms) de l'heure du Maroc par rapport à UTC à cet instant. */
function zoneOffsetMs(utcMs: number): number {
  const p = Object.fromEntries(partsFormatter.formatToParts(new Date(utcMs)).map((x) => [x.type, x.value]))
  return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(utcMs / 1000) * 1000
}

/** Valeur d'un champ datetime-local (« 2026-10-14T18:00 », heure du Maroc) → ISO UTC ; null si invalide. */
export function parseSchoolDateTime(value: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim())
  if (!m) return null
  const [y, mo, d, h, mi] = m.slice(1).map(Number)
  if (h > 23 || mi > 59) return null
  const naive = Date.UTC(y, mo - 1, d, h, mi)
  const check = new Date(naive)
  if (check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d) return null
  // Deux passes : le décalage peut changer entre l'heure « naïve » et l'heure réelle (changement d'heure).
  let utc = naive - zoneOffsetMs(naive)
  utc = naive - zoneOffsetMs(utc)
  return new Date(utc).toISOString()
}

/** ISO UTC → valeur pour un champ datetime-local (heure du Maroc). */
export function toSchoolInput(iso: string): string {
  const ms = Date.parse(iso)
  return new Date(ms + zoneOffsetMs(ms)).toISOString().slice(0, 16)
}

const dueFormatter = new Intl.DateTimeFormat('fr-FR', {
  timeZone: SCHOOL_TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

/** « mercredi 14 octobre 2026 à 18 h 00 » */
export function formatDue(iso: string): string {
  const p = Object.fromEntries(dueFormatter.formatToParts(new Date(iso)).map((x) => [x.type, x.value]))
  return `${p.weekday} ${p.day} ${p.month} ${p.year} à ${p.hour} h ${p.minute}`
}

/** Temps restant lisible par un élève. */
export function formatRemaining(ms: number): string {
  if (ms <= 0) return 'Temps écoulé'
  const totalMinutes = Math.max(1, Math.ceil(ms / 60_000))
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  if (days > 0) return `${days} jour${days > 1 ? 's' : ''} ${hours} h`
  if (hours > 0) return `${hours} h ${String(minutes).padStart(2, '0')} min`
  return `${minutes} min`
}
