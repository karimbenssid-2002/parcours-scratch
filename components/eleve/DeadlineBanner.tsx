'use client'
import { useEffect, useState } from 'react'
import { AlarmClock } from 'lucide-react'
import { formatDue, formatRemaining } from '@/lib/deadlines/time'

/** Échéance et temps restant ; l'horloge du serveur fait foi (décalage mesuré au chargement).
 *  « hero » : compte à rebours jaune de l'en-tête ; « inline » : rappel au-dessus de l'éditeur. */
export function DeadlineBanner({ dueAt, serverNow, variant = 'inline' }: { dueAt: string; serverNow: string; variant?: 'hero' | 'inline' }) {
  const [skew] = useState(() => Date.parse(serverNow) - Date.now())
  const [nowMs, setNowMs] = useState(() => Date.parse(serverNow))
  const left = Date.parse(dueAt) - nowMs
  // Le temps restant s'affiche à la minute (arrondi supérieur) : un seul rendu par changement de minute,
  // calé sur l'instant où le texte change (les seuils « 1 h » et « écoulé » tombent aussi sur une minute pile).
  useEffect(() => {
    if (left <= 0) return
    const timer = setTimeout(() => setNowMs(Date.now() + skew), (left % 60_000 || 60_000) + 50)
    return () => clearTimeout(timer)
  }, [left, skew])

  if (variant === 'hero') {
    const tone = left <= 0 ? 'bg-st-bad-bg text-st-bad'
      : left < 3_600_000 ? 'bg-st-almost-bg text-st-almost'
        : 'bg-primary-wash text-primary-ink'
    return (
      <div role="status" className={`flex items-center gap-3.5 rounded-xl px-4 py-3 ${tone}`}>
        <AlarmClock className="size-7 shrink-0" aria-hidden />
        <div>
          <p className="text-[13px] font-medium">{left <= 0 ? 'Temps écoulé' : 'Il reste'}</p>
          {left > 0 && <p aria-live="off" className="text-[26px] font-semibold leading-tight">{formatRemaining(left)}</p>}
          <p className="text-[13px]">avant le {formatDue(dueAt)}</p>
        </div>
      </div>
    )
  }

  const tone = left <= 0 ? 'bg-st-bad-bg text-st-bad' : left < 3_600_000 ? 'bg-st-almost-bg text-st-almost' : 'bg-primary-wash text-primary-ink'
  return (
    <p role="status" className={`flex flex-wrap items-center gap-2 rounded-xl px-4 py-3 font-medium ${tone}`}>
      <AlarmClock className="size-5 shrink-0" aria-hidden />
      <span>À rendre avant le {formatDue(dueAt)}</span>
      <span aria-live="off">— {left <= 0 ? 'temps écoulé' : `il reste ${formatRemaining(left)}`}</span>
    </p>
  )
}
