'use client'
import { useActionState, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'
import { importCapytaleAction, type ActivityFormState } from '../actions'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'
import { uploadProject } from '@/lib/storage/upload-client'

const SOURCE_LABELS = { upload: 'un fichier envoyé', capytale: 'Capytale', breizh: 'le site breizh' } as const

type Props = { activityId: string; source: 'upload' | 'capytale' | 'breizh' | null; capytaleUrl: string | null }

export function StarterPanel({ activityId, source, capytaleUrl }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState<{ pending: boolean; message?: string; error?: string }>({ pending: false })
  const [capytaleRef, setCapytaleRef] = useState('') // contrôlé : conservé après une erreur (le cookie, lui, est effacé)
  const [capytale, capytaleAction] = useActionState<ActivityFormState, FormData>(importCapytaleAction.bind(null, activityId), null)

  async function sendFile() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setUpload({ pending: false, error: 'Choisissez un fichier .sb3 ou .sb2.' })
    setUpload({ pending: true })
    try {
      const res = await uploadProject(`/api/admin/activites/${activityId}/depart`, file)
      const data = (await res.json().catch(() => ({}))) as { format?: string; error?: string }
      if (!res.ok) return setUpload({ pending: false, error: data.error ?? 'L’envoi a échoué.' })
      setUpload({ pending: false, message: `Projet de départ enregistré (.${data.format})` })
      if (fileRef.current) fileRef.current.value = ''
      router.refresh()
    } catch {
      setUpload({ pending: false, error: 'L’envoi a échoué. Vérifiez votre connexion.' })
    }
  }

  return (
    <section aria-labelledby="depart" className="glass space-y-4 p-6">
      <h2 id="depart" className="text-2xl font-semibold">Projet de départ</h2>
      <p className="text-muted">
        {source ? <>Projet actuel : <strong>{SOURCE_LABELS[source]}</strong>{capytaleUrl && source === 'capytale' ? <> ({capytaleUrl})</> : null}.</> : 'Aucun projet de départ : les élèves partiront d’un projet vierge.'}
      </p>

      <div className="space-y-2 rounded-xl bg-surface p-4">
        <h3 className="font-semibold">Envoyer un fichier</h3>
        <label htmlFor="starter-file" className="block text-sm font-semibold">Fichier .sb3 ou .sb2</label>
        <input id="starter-file" ref={fileRef} type="file" accept=".sb3,.sb2" className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-white" />
        <Button onClick={() => void sendFile()} disabled={upload.pending}><Upload className="size-5" aria-hidden />{upload.pending ? 'Envoi…' : 'Envoyer le fichier'}</Button>
        {upload.error && <Alert tone="danger">{upload.error}</Alert>}
        {upload.message && <Alert tone="success">{upload.message}</Alert>}
      </div>

      <form action={capytaleAction} className="space-y-3 rounded-xl bg-surface p-4">
        <h3 className="font-semibold">Ou récupérer depuis Capytale</h3>
        <p className="text-sm text-muted">
          Sur capytale2.ac-paris.fr connecté : F12 → Application → Cookies → copiez le nom (SSESS…) et la valeur du cookie.
          Il sert à cette seule récupération et n’est jamais conservé.
        </p>
        <Field label="Adresse ou code Capytale" name="capytale" value={capytaleRef} onChange={(e) => setCapytaleRef(e.target.value)} placeholder="https://capytale2.ac-paris.fr/web/c/0a1b-1234567/local" required />
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du cookie" name="cookieName" placeholder="SSESS…" autoComplete="off" required />
          <Field label="Valeur du cookie" name="cookieValue" type="password" autoComplete="off" required />
        </div>
        {capytale?.error && <Alert tone="danger">{capytale.error}</Alert>}
        {capytale?.success && <Alert tone="success">{capytale.success}</Alert>}
        <SubmitButton variant="secondary" pendingLabel="Récupération…">Récupérer depuis Capytale</SubmitButton>
      </form>
    </section>
  )
}
