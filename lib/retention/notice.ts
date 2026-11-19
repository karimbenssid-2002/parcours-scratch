import { isWarningPeriod } from '@/lib/retention/calendar'

const TEXTES = {
  eleve: 'Le 31 juillet, tous les projets seront effacés pour la nouvelle année. Télécharge ceux que tu veux garder avec le lien « Télécharger mon projet » de chaque défi.',
  enseignant: 'Le 31 juillet, toutes les classes et les travaux des élèves seront effacés. Vous recréerez vos classes à la rentrée.',
} as const

/** Texte du bandeau d'avertissement (15 juin - 30 juillet), ou null le reste de l'année. */
export function retentionNoticeText(audience: 'eleve' | 'enseignant', nowMs: number): string | null {
  return isWarningPeriod(nowMs) ? TEXTES[audience] : null
}
