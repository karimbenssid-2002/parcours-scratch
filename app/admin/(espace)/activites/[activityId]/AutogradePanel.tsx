'use client'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDown, ArrowUp, FlaskConical, Plus, Trash2, Upload } from 'lucide-react'
import { saveAutogradeAction, testAutogradeAction } from './autograde-actions'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { uploadProject } from '@/lib/storage/upload-client'

const MAX_CRITERIA = 8
let nextKey = 1

type Props = {
  activityId: string
  ready: boolean
  solutionFormat: 'sb3' | 'sb2' | null
  criteria: string[]
  answers: string[]
  keys: string // déjà formaté en français
  durationMs: number
}

export function AutogradePanel(props: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState<{ pending: boolean; message?: string; error?: string }>({ pending: false })
  const [criteria, setCriteria] = useState(() => (props.criteria.length ? props.criteria : ['']).map((text) => ({ key: nextKey++, text })))
  const [answers, setAnswers] = useState(props.answers.join('\n'))
  const [keys, setKeys] = useState(props.keys)
  const [seconds, setSeconds] = useState(String(props.durationMs / 1000))
  const [saved, setSaved] = useState<{ error?: string; success?: string }>()
  const [test, setTest] = useState<{ error?: string; summary?: string; identical?: boolean }>()
  const [saving, startSave] = useTransition()
  const [testing, startTest] = useTransition()

  async function sendFile() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setUpload({ pending: false, error: 'Choisissez un fichier .sb3 ou .sb2.' })
    setUpload({ pending: true })
    try {
      const res = await uploadProject(`/api/admin/activites/${props.activityId}/solution`, file)
      const data = (await res.json().catch(() => ({}))) as { format?: string; error?: string }
      if (!res.ok) return setUpload({ pending: false, error: data.error ?? 'L’envoi a échoué.' })
      setUpload({ pending: false, message: `Solution enregistrée (.${data.format})` })
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch {
      setUpload({ pending: false, error: 'L’envoi a échoué. Vérifiez votre connexion.' })
    }
  }

  const move = (i: number, d: number) => setCriteria((rows) => {
    const j = i + d
    if (j < 0 || j >= rows.length) return rows
    const copy = [...rows]
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
    return copy
  })

  return (
    <section aria-labelledby="correction-auto" className="glass space-y-4 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 id="correction-auto" className="flex-1 text-2xl font-semibold">Correction automatique</h2>
        <span className={`rounded-full px-3 py-1 text-sm font-bold ${props.ready ? 'bg-green-100 text-cta' : 'bg-slate-100 text-slate-700'}`}>
          {props.ready ? 'Prête' : 'Non préparée'}
        </span>
      </div>
      <p className="text-muted">
        Le site exécute le programme de l’élève et la solution avec les mêmes entrées, puis tranche seul quand les résultats sont identiques ;
        sinon, l’IA compare les deux programmes à vos critères. Cette solution sert aussi de corrigé si un professeur le partage.
      </p>

      <div className="space-y-2 rounded-xl bg-surface p-4">
        <h3 className="font-semibold">Solution de référence</h3>
        <p className="text-sm text-muted">{props.solutionFormat ? `Solution enregistrée (.${props.solutionFormat}).` : 'Aucune solution.'}</p>
        <label htmlFor="solution-file" className="block text-sm font-semibold">Solution de référence (.sb3 ou .sb2)</label>
        <input id="solution-file" ref={fileRef} type="file" accept=".sb3,.sb2" className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-white" />
        <Button onClick={() => void sendFile()} disabled={upload.pending}><Upload className="size-5" aria-hidden />{upload.pending ? 'Envoi…' : 'Envoyer la solution'}</Button>
        {upload.error && <Alert tone="danger">{upload.error}</Alert>}
        {upload.message && <Alert tone="success">{upload.message}</Alert>}
      </div>

      {/* onSubmit plutôt que action={…} : React 19 réinitialise le formulaire après une action (saisie perdue en cas d'erreur). */}
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault()
        startSave(async () => setSaved(await saveAutogradeAction(props.activityId, {
          criteria: criteria.map((c) => c.text), answers, keys, durationSeconds: Number(seconds),
        })))
      }}>
        <fieldset className="space-y-2">
          <legend className="font-semibold">Critères de réussite</legend>
          <p className="text-sm text-muted">Ce que doit faire le programme, une phrase par critère (ex. « Le lutin demande le prénom puis le répète »).</p>
          <ol className="space-y-2">
            {criteria.map((c, i) => (
              <li key={c.key} className="flex items-end gap-1">
                <div className="flex-1 space-y-1">
                  <label htmlFor={`critere-${c.key}`} className="text-sm font-semibold">{`Critère de réussite n°${i + 1}`}</label>
                  <input id={`critere-${c.key}`} value={c.text} maxLength={800}
                    onChange={(e) => setCriteria((rows) => rows.map((r) => (r.key === c.key ? { ...r, text: e.target.value } : r)))}
                    className="w-full rounded-lg border-2 border-line bg-white px-3 py-2" />
                </div>
                <Button variant="ghost" className="px-2" aria-label={`Monter le critère n°${i + 1}`} disabled={i === 0} onClick={() => move(i, -1)}><ArrowUp className="size-4" aria-hidden /></Button>
                <Button variant="ghost" className="px-2" aria-label={`Descendre le critère n°${i + 1}`} disabled={i === criteria.length - 1} onClick={() => move(i, 1)}><ArrowDown className="size-4" aria-hidden /></Button>
                <Button variant="ghost" className="px-2" aria-label={`Supprimer le critère n°${i + 1}`} disabled={criteria.length === 1}
                  onClick={() => setCriteria((rows) => rows.filter((r) => r.key !== c.key))}><Trash2 className="size-4" aria-hidden /></Button>
              </li>
            ))}
          </ol>
          <Button variant="secondary" className="text-base" disabled={criteria.length >= MAX_CRITERIA}
            onClick={() => setCriteria((rows) => [...rows, { key: nextKey++, text: '' }])}><Plus className="size-4" aria-hidden />Ajouter un critère</Button>
        </fieldset>

        <details className="rounded-xl bg-surface p-4" open={answers !== '' || keys !== ''}>
          <summary className="cursor-pointer font-semibold">Entrées de test (facultatif)</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label htmlFor="answers" className="block text-sm font-semibold">Réponses aux questions (une par ligne)</label>
              <textarea id="answers" rows={3} value={answers} onChange={(e) => setAnswers(e.target.value)} className="w-full rounded-lg border-2 border-line bg-white p-2" />
            </div>
            <div className="space-y-1">
              <label htmlFor="keys" className="block text-sm font-semibold">Touches (ex. espace × 2, flèche droite × 3)</label>
              <input id="keys" value={keys} onChange={(e) => setKeys(e.target.value)} className="w-full rounded-lg border-2 border-line bg-white px-3 py-2" />
            </div>
            <div className="space-y-1">
              <label htmlFor="duration" className="block text-sm font-semibold">Durée d’une exécution (secondes)</label>
              <input id="duration" type="number" min={2} max={60} value={seconds} onChange={(e) => setSeconds(e.target.value)} className="w-32 rounded-lg border-2 border-line bg-white px-3 py-2" />
            </div>
          </div>
          <p className="mt-2 text-sm text-muted">Sans entrées, le site répond « test », « 5 », « oui » aux questions et presse espace et les flèches.</p>
        </details>

        {saved?.error && <Alert tone="danger">{saved.error}</Alert>}
        {saved?.success && <Alert tone="success">{saved.success}</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer la correction automatique'}</Button>
          <Button variant="secondary" disabled={testing || !props.solutionFormat} onClick={() => startTest(async () => setTest(await testAutogradeAction(props.activityId)))}>
            <FlaskConical className="size-5" aria-hidden />{testing ? 'Exécution…' : 'Tester la correction'}
          </Button>
        </div>
      </form>

      {test?.error && <Alert tone="danger">{test.error}</Alert>}
      {test?.summary && (
        <div className="space-y-2">
          <Alert tone={test.identical ? 'success' : 'info'}>
            {test.identical ? 'Les 5 exécutions sont identiques : un travail identique à la solution sera validé sans IA.' : 'Les exécutions varient (hasard ou entrées) : l’IA sera utilisée.'}
          </Alert>
          <details className="rounded-xl bg-surface p-3">
            <summary className="cursor-pointer font-semibold">Ce que le site a relevé</summary>
            <pre className="mt-2 max-h-80 overflow-auto whitespace-pre-wrap text-sm">{test.summary}</pre>
          </details>
        </div>
      )}
    </section>
  )
}
