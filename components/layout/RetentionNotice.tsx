import { Alert } from '@/components/ui/Alert'
import { now } from '@/lib/clock'
import { retentionNoticeText } from '@/lib/retention/notice'

/** Bandeau de juin-juillet : rappelle l'effacement du 31 juillet. Rien le reste de l'année. */
export function RetentionNotice({ audience }: { audience: 'eleve' | 'enseignant' }) {
  const text = retentionNoticeText(audience, now().getTime())
  return text ? <Alert tone="warning">{text}</Alert> : null
}
