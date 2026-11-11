'use client'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Eye, Send } from 'lucide-react'
import { correctionStatusAction, startCorrectionAction } from './autograde-actions'
import { DecisionForm, type Prefill } from './DecisionForm'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import type { JobView } from '@/lib/autograde/service'
import { STATUS_LABELS } from '@/lib/progress/rules'

type Props = {
  progressId: string
  classId?: string
  deadlinePassed: boolean
  autogradeReady: boolean
  aiConfigured: boolean
  autogradeEnabled: boolean
  /** Lien vers la fiche d'activité à préparer (admin uniquement), sinon null. */
  prepareHref: string | null
  initialJob: JobView | null
  initialPrefill: Prefill | null
  nextHref: string // où aller après une correction envoyée automatiquement
}

const ACTIVE = ['queued', 'running', 'waiting_ai']
const MODEL_LABELS: Record<string, string> = { 'claude-haiku-4-5': 'Haiku 4.5', 'claude-sonnet-5-5': 'Sonnet 5.5' }

/** Formulaire de décision, avec la correction automatique du défi ouvert :
 *  « Corriger et vérifier » pré-remplit la décision (envoi manuel), « Corriger et envoyer » l'envoie directement. */
export function ReviewSide(props: Props) {
  const router = useRouter()
  const [job, setJob] = useState<JobView | null>(props.initialJob)
  const [error, setError] = useState<string>()
  const [prefill, setPrefill] = useState<Prefill | null>(props.initialPrefill)
  const [pending, start] = useTransition()
  const active = job !== null && ACTIVE.includes(job.status)

  // Suivi toutes les secondes tant que la correction tourne.
  useEffect(() => {
    if (!active) return
    const timer = setInterval(async () => {
      const next = await correctionStatusAction(props.progressId)
      setJob(next)
      // Une proposition qui arrive pré-remplit la décision : le professeur relit puis enregistre.
      if (next?.status === 'done' && next.proposal) setPrefill({ jobId: next.id, decision: next.proposal.decision, comment: next.proposal.comment })
      if (next?.status === 'applied') router.push(props.nextHref)
    }, 1000)
    return () => clearInterval(timer)
  }, [active, props.progressId, props.nextHref, router])

  const launch = (mode: 'propose' | 'send') => start(async () => {
    setError(undefined)
    const r = await startCorrectionAction(props.progressId, mode)
    if (r.error) return setError(r.error)
    setJob(r.job ?? null)
    if (r.job?.status === 'done' && r.job.proposal) setPrefill({ jobId: r.job.id, decision: r.job.proposal.decision, comment: r.job.proposal.comment })
  })

  const proposal = job?.status === 'done' ? job.proposal : null

  const disabled = !props.autogradeReady || active || pending
  const why = props.autogradeReady ? undefined : 'Activité non préparée pour la correction automatique'
  const headerAction = (
    <div role="group" aria-label="Correction automatique" className="grid w-full gap-2 sm:grid-cols-2">
      <Button variant="secondary" className="min-h-11 justify-start px-3 text-left text-[15px]" disabled={disabled} title={why} onClick={() => launch('propose')}>
        <Eye className="size-[18px] shrink-0" aria-hidden />
        <span><span className="block">Corriger et vérifier</span><span className="block text-xs font-normal text-muted">Vous relisez puis envoyez</span></span>
      </Button>
      <Button variant="secondary" className="min-h-11 justify-start px-3 text-left text-[15px]" disabled={disabled || !props.aiConfigured} title={why} onClick={() => launch('send')}>
        <Send className="size-[18px] shrink-0" aria-hidden />
        <span><span className="block">Corriger et envoyer</span><span className="block text-xs font-normal text-muted">Envoyé directement à l’élève</span></span>
      </Button>
    </div>
  )

  const notice = (
    <>
      {!props.autogradeReady && (
        <p className="text-sm text-muted">
          Correction automatique indisponible : cette activité n’a pas encore de solution de référence ni de critères.
          {props.prepareHref ? <> <Link href={props.prepareHref} className="font-semibold text-primary-ink hover:underline">Préparer l’activité</Link></> : ' L’administrateur peut la préparer.'}
        </p>
      )}
      {props.autogradeReady && !props.aiConfigured && (
        <p className="text-sm text-muted">Clé d’API absente : seule une proposition sans IA est possible (travail identique à la solution, ou vide).</p>
      )}
      {active && <p role="status" className="font-semibold text-primary-ink">Correction automatique en cours…</p>}
      {error && <Alert tone="danger">{error}</Alert>}
      {job?.status === 'failed' && <Alert tone="danger">Échec de la correction : {job.error}</Alert>}
      {job?.status === 'stale' && <Alert tone="info">Le défi a changé pendant la correction : rien n’a été envoyé.</Alert>}
      {proposal && (
        <p role="status" className="rounded-xl bg-st-ok-bg px-3 py-2 text-sm text-st-ok">
          <span className="font-semibold">Correction proposée : {STATUS_LABELS[proposal.decision]}</span>
          <span className="block text-xs">{proposal.source === 'tests' ? 'Sans IA : identique à la solution' : `Analysé par l’IA (${MODEL_LABELS[proposal.model ?? ''] ?? proposal.model})`} · décision pré-remplie ci-dessous.</span>
        </p>
      )}
    </>
  )

  // Correction automatique désactivée (site en ligne) : formulaire de décision seul, sans bouton ni message.
  if (!props.autogradeEnabled) return <DecisionForm key="manuel" progressId={props.progressId} classId={props.classId} deadlinePassed={props.deadlinePassed} prefill={null} />
  // Remonté à chaque proposition reprise : les champs repartent des valeurs proposées.
  return (
    <DecisionForm key={prefill?.jobId ?? 'manuel'} progressId={props.progressId} classId={props.classId} deadlinePassed={props.deadlinePassed}
      prefill={prefill} headerAction={headerAction} notice={notice} />
  )
}
