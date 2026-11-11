import type { ReviewDecision } from '@/lib/db/schema'

const STAMP: Record<ReviewDecision, { text: string; cls: string }> = {
  validated: { text: 'Validé', cls: 'text-st-ok' },
  almost: { text: 'Presque réussi', cls: 'text-st-almost' },
  needs_work: { text: 'Non réussi', cls: 'text-st-bad' },
}

/** Tampon du professeur : la décision, comme posée à la main sur la copie. */
export function TeacherStamp({ decision, className = '' }: { decision: ReviewDecision; className?: string }) {
  const { text, cls } = STAMP[decision]
  return <span className={`tampon ${cls} ${className}`}>{text}</span>
}

/** Appréciation du professeur, écrite à la main à l'encre rouge. */
export function TeacherInk({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <p className={`encre whitespace-pre-line ${className}`}>{children}</p>
}
