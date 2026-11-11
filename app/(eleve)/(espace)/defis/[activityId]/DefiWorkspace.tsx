'use client'
import { useCallback, useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Monitor, RotateCcw, Save, Send } from 'lucide-react'
import { ScratchEditor, type EditorPhase, type ScratchEditorHandle } from '@/components/scratch/ScratchEditor'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { finishAtDeadlineAction, restartDefiAction, submitDefiAction } from './actions'
import { DeadlineBanner } from '@/components/eleve/DeadlineBanner'
import { usePhone } from '@/lib/ui/use-phone'
import { uploadProject } from '@/lib/storage/upload-client'

type SaveState = { kind: 'idle' } | { kind: 'saving' } | { kind: 'saved'; at: string } | { kind: 'error'; message: string }

const AUTOSAVE_MS = 60_000

type Props = {
  activityId: string
  editable: boolean
  /** Défi validé : l'élève peut encore modifier et lancer son code, mais rien n'est enregistré ni envoyé. */
  sandbox: boolean
  submittable: boolean
  /** Raison pour laquelle l'envoi est impossible (échéance passée), sinon null. */
  submitBlocked: string | null
  dueAt: string | null
  serverNow: string
}

export function DefiWorkspace({ activityId, editable, sandbox, submittable, submitBlocked, dueAt, serverNow }: Props) {
  const router = useRouter()
  const phone = usePhone()
  const editorRef = useRef<ScratchEditorHandle>(null)
  const [phase, setPhase] = useState<EditorPhase>('loading')
  const [dirty, setDirty] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' })
  const [confirming, setConfirming] = useState<null | 'submit' | 'restart'>(null)
  const [pending, startTransition] = useTransition()
  const leavingRef = useRef(false)
  const savingRef = useRef(false)
  const projectUrl = `/api/projets/${activityId}`
  const ready = phase === 'ready'
  const [skew] = useState(() => Date.parse(serverNow) - Date.now()) // l'horloge du serveur fait foi
  const [deadlineNote, setDeadlineNote] = useState<string | null>(null)
  const firedRef = useRef({ warn: false, end: false })

  const save = useCallback(async (): Promise<boolean> => {
    if (savingRef.current) return false
    savingRef.current = true
    setSaveState({ kind: 'saving' })
    try {
      const bytes = await editorRef.current!.getSb3()
      const res = await uploadProject(projectUrl, new Blob([bytes], { type: 'application/octet-stream' }))
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) {
        setSaveState({ kind: 'error', message: data.error ?? 'La sauvegarde a échoué.' })
        return false
      }
      // Le pont ne remet « non modifié » que si rien n'a bougé pendant l'envoi : il nous prévient via onChangeState.
      editorRef.current!.markSaved()
      setSaveState({ kind: 'saved', at: new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) })
      if (!submittable) router.refresh() // statut « En cours » et bouton d'envoi à jour dès la première sauvegarde
      return true
    } catch {
      setSaveState({ kind: 'error', message: 'La sauvegarde a échoué. Vérifie ta connexion.' })
      return false
    } finally {
      savingRef.current = false
    }
  }, [projectUrl, router, submittable])

  // Sauvegarde automatique toutes les minutes tant qu'il reste des modifications (y compris après un échec).
  useEffect(() => {
    if (!editable || !dirty || !ready) return
    const timer = setInterval(() => void save(), AUTOSAVE_MS)
    return () => clearInterval(timer)
  }, [dirty, editable, ready, save])

  // Avertissement avant de fermer l'onglet ou de recharger la page avec des modifications non sauvegardées.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!leavingRef.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  // Les liens du site (« Mon parcours », en-tête…) ne déclenchent pas beforeunload : on sauvegarde avant de partir.
  useEffect(() => {
    if (!dirty || !editable || !ready) return
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
      const link = (event.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
      if (!link || link.target === '_blank') return
      const url = new URL(link.href, window.location.href)
      if (url.origin !== window.location.origin) return
      event.preventDefault()
      event.stopPropagation()
      void save().then((ok) => {
        if (ok || window.confirm('La sauvegarde a échoué. Quitter quand même et perdre tes dernières modifications ?')) {
          leavingRef.current = true
          window.location.assign(url.href)
        }
      })
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty, editable, ready, save])

  // Une minute avant l'échéance : sauvegarde ; à l'heure dite : dernière sauvegarde, rendu, rechargement.
  // Armé seulement si l'échéance est encore à venir (après l'échéance, l'élève peut continuer à travailler) ;
  // une nouvelle date (délai accordé) réarme le minuteur.
  useEffect(() => {
    firedRef.current = { warn: false, end: Date.parse(dueAt ?? '') <= Date.now() + skew }
  }, [dueAt, skew])

  useEffect(() => {
    if (!dueAt || !editable || !ready || firedRef.current.end) return
    const due = Date.parse(dueAt)
    const tick = async () => {
      const nowMs = Date.now() + skew
      if (!firedRef.current.warn && nowMs >= due - 60_000 && nowMs < due) {
        firedRef.current.warn = true
        setDeadlineNote('Ton travail va être rendu automatiquement dans une minute.')
        if (dirty) await save()
      }
      if (!firedRef.current.end && nowMs >= due) {
        firedRef.current.end = true
        if (dirty) await save()
        await finishAtDeadlineAction(activityId)
        router.refresh()
      }
    }
    const timer = setInterval(() => void tick(), 1000)
    return () => clearInterval(timer)
  }, [activityId, dirty, dueAt, editable, ready, router, save, skew])

  const submit = () => startTransition(async () => {
    setConfirming(null)
    // Toujours sauvegarder juste avant l'envoi : le professeur reçoit la dernière version, même si l'éditeur
    // n'a pas signalé la modification (position d'un lutin, etc.).
    if (!(await save())) return
    const result = await submitDefiAction(activityId)
    if (result.error) setSaveState({ kind: 'error', message: result.error })
    else router.refresh()
  })

  const restart = () => startTransition(async () => {
    setConfirming(null)
    const result = await restartDefiAction(activityId)
    if (result.error) return setSaveState({ kind: 'error', message: result.error })
    setDirty(false)
    setSaveState({ kind: 'idle' })
    await editorRef.current?.reload()
    router.refresh()
  })

  const statusText =
    saveState.kind === 'saving' ? 'Enregistrement…'
      : dirty ? 'Modifications non sauvegardées'
        : saveState.kind === 'saved' ? `Sauvegardé à ${saveState.at}`
          : null

  return (
    <section aria-label="Espace de travail" className="space-y-3">
      <p className="flex items-start gap-2.5 rounded-xl bg-primary-wash p-4 text-sm font-medium text-primary-ink md:hidden">
        <Monitor className="mt-0.5 size-[18px] shrink-0" aria-hidden />
        <span><b className="font-semibold">Pas d’éditeur sur téléphone.</b> Ouvre ce défi sur un ordinateur ou une tablette pour coder et l’envoyer à ton professeur.</span>
      </p>
      <div className="hidden space-y-3 md:block">
        {dueAt && <DeadlineBanner dueAt={dueAt} serverNow={serverNow} />}
        {deadlineNote && <Alert tone="warning">{deadlineNote}</Alert>}
        {sandbox && <Alert tone="info">Défi validé : tu peux modifier et lancer ton programme pour t’entraîner, mais tes modifications ne seront pas enregistrées.</Alert>}
        {editable && (
          <div className="glass flex flex-wrap items-center gap-2 px-4 py-3">
            <p className="mr-2 font-semibold">Mon programme</p>
            <Button onClick={() => void save()} disabled={!ready || pending || saveState.kind === 'saving'}><Save className="size-5" aria-hidden />Sauvegarder</Button>
            {submitBlocked ? (
              <p className="rounded-xl bg-st-bad-bg px-3 py-2 text-sm font-medium text-st-bad">{submitBlocked}</p>
            ) : (
              <Button variant="cta" onClick={() => setConfirming('submit')} disabled={!ready || pending || (!submittable && !dirty)}>
                <Send className="size-5" aria-hidden />J'ai terminé, j'envoie mon défi
              </Button>
            )}
            <Button variant="secondary" onClick={() => setConfirming('restart')} disabled={!ready || pending}><RotateCcw className="size-5" aria-hidden />Recommencer</Button>
            <p aria-live="polite" className="ml-auto text-[13px] font-medium text-muted">{statusText}</p>
          </div>
        )}
        {saveState.kind === 'error' && <Alert tone="danger">{saveState.message}</Alert>}
        {confirming && (
          <div role="alertdialog" aria-label="Confirmation" className="glass flex flex-wrap items-center gap-3 p-4">
            <p className="flex-1 font-semibold">
              {confirming === 'submit'
                ? 'Envoyer ton défi au professeur ? Tu ne pourras plus le modifier tant qu’il ne l’aura pas regardé.'
                : 'Recommencer depuis le projet de départ ? Ton travail sur ce défi sera effacé.'}
            </p>
            <Button variant={confirming === 'submit' ? 'cta' : 'danger'} onClick={confirming === 'submit' ? submit : restart}>
              {confirming === 'submit' ? 'Oui, envoyer' : 'Oui, recommencer'}
            </Button>
            <Button variant="secondary" onClick={() => setConfirming(null)}>Annuler</Button>
          </div>
        )}
        {/* Pas d'éditeur sur téléphone : on ne le charge même pas. */}
        {!phone && <ScratchEditor
          key={editable || sandbox ? 'edit' : 'player'}
          ref={editorRef}
          projectUrl={projectUrl}
          mode={editable || sandbox ? 'edit' : 'player'}
          onChangeState={editable ? setDirty : undefined}
          onPhaseChange={setPhase}
        />}
      </div>
    </section>
  )
}
