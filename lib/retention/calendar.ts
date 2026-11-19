import { SCHOOL_TZ } from '@/lib/deadlines/time'

/** Remise à zéro annuelle : le 31 juillet (heure de Rabat). */
export const RESET_MONTH_DAY = { month: 7, day: 31 }
/** Début de la période d'avertissement : le 15 juin (jusqu'au 30 juillet inclus). */
export const WARNING_FROM = { month: 6, day: 15 }

const dateFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: SCHOOL_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
})

/** Date civile à Rabat (et non en UTC : le Maroc alterne GMT+1 et GMT pendant le ramadan). */
function rabatDate(nowMs: number): { year: number; month: number; day: number } {
  const p = Object.fromEntries(dateFormatter.formatToParts(new Date(nowMs)).map((x) => [x.type, x.value]))
  return { year: +p.year, month: +p.month, day: +p.day }
}

const before = (m: number, d: number, ref: { month: number; day: number }) =>
  m < ref.month || (m === ref.month && d < ref.day)

/** Année Y du dernier 31 juillet atteint à Rabat. */
export function resetYearFor(nowMs: number): number {
  const { year, month, day } = rabatDate(nowMs)
  return before(month, day, RESET_MONTH_DAY) ? year - 1 : year
}

/** Vrai du 15 juin au 30 juillet inclus (date de Rabat). */
export function isWarningPeriod(nowMs: number): boolean {
  const { month, day } = rabatDate(nowMs)
  return !before(month, day, WARNING_FROM) && before(month, day, RESET_MONTH_DAY)
}
