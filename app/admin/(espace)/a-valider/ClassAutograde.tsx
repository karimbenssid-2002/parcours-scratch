'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Bot, Eye, Send } from 'lucide-react'
import { classCorrectionStatusAction, startClassCorrectionAction, type ClassRun } from './autograde-actions'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'

type Props = { classId: string; eligible: number; skipped: number; initialRun: ClassRun; aiConfigured: boolean }

/** Correction automatique de toute la file d'une classe, avec suivi de l'avancement. */
export function ClassAutograde({ classId, eligible, skipped, initialRun, aiConfigured }: Props) {
  const router = useRouter()
  const [run, setRun] = useState<ClassRun>(initialRun)
  const lastRun = useRef<ClassRun>(initialRun) // dernier état reçu, lu par le minuteur
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  const running = run !== null && !run.finished

  useEffect(() => {
    if (!running) return
    const timer = setInterval(async () => {
      const next = await classCorrectionStatusAction(classId)
      // Badges de la file : la page n'est recalculée que si l'avancement a bougé (et non toutes les 5 s).
      const prev = lastRun.current
      const moved = !next || next.done !== prev?.done || next.failed !== prev?.failed || next.finished !== prev?.finished
      lastRun.current = next
      setRun(next)
      if (moved) router.refresh()
    }, 5000)
    return () => clearInterval(timer)
  }, [classId, router, running])

  const launch = (mode: 'propose' | 'send') => start(async () => {
    setError(undefined)
    const r = await startClassCorrectionAction(classId, mode)
    if (r.error) return setError(r.error)
    setConfirming(false)
    const started = await classCorrectionStatusAction(classId)
    lastRun.current = started
    setRun(started)
    router.refresh()
  })

  if (eligible === 0 && !running && skipped === 0) return null
  return (
    <section aria-labelledby="auto-classe" className="glass space-y-3 p-5">
      <h2 id="auto-classe" className="flex items-center gap-2 text-xl font-semibold"><Bot className="size-5 text-primary" aria-hidden />Correction automatique</h2>
      {running && <p role="status" className="font-semibold text-primary-ink">{run.done + run.failed} / {run.total} corrigés…</p>}
      {!running && run?.finished && <p role="status" className="text-sm text-muted">Dernière correction automatique : {run.done} corrigé(s), {run.failed} à faire à la main.</p>}
      {skipped > 0 && <p className="text-sm text-muted">{skipped} défi{skipped > 1 ? 's' : ''} ne peu{skipped > 1 ? 'vent' : 't'} pas être corrigé{skipped > 1 ? 's' : ''} automatiquement : activité non préparée.</p>}
      {!aiConfigured && <p className="text-sm text-muted">Correction automatique non configurée (clé d’API absente).</p>}
      {!running && eligible > 0 && aiConfigured && (
        <>
          <p className="text-sm text-muted">{eligible === 1 ? '1 défi prêt' : `${eligible} défis prêts`} pour la correction automatique.</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button disabled={pending} className="justify-start text-left" onClick={() => launch('propose')}>
              <Eye className="size-[18px] shrink-0" aria-hidden />
              <span><span className="block">Corriger et vérifier</span><span className="block text-xs font-normal opacity-85">Vous relisez chaque proposition avant l’envoi</span></span>
            </Button>
            <Button variant="secondary" disabled={pending} className="justify-start text-left" onClick={() => setConfirming(true)}>
              <Send className="size-[18px] shrink-0" aria-hidden />
              <span><span className="block">Corriger et envoyer</span><span className="block text-xs font-normal text-muted">Les décisions partent directement aux élèves</span></span>
            </Button>
          </div>
          {confirming && (
            <div role="alertdialog" aria-label="Confirmation" className="flex flex-wrap items-center gap-3 rounded-xl bg-st-almost-bg p-3 text-st-almost">
              <p className="flex-1 font-medium">Envoyer directement aux élèves les décisions de la correction automatique, sans les relire ?</p>
              <Button variant="cta" disabled={pending} onClick={() => launch('send')}>Oui, envoyer</Button>
              <Button variant="secondary" onClick={() => setConfirming(false)}>Annuler</Button>
            </div>
          )}
        </>
      )}
      {error && <Alert tone="danger">{error}</Alert>}
    </section>
  )
}
