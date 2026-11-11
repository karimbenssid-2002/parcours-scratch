'use client'
import { useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Blocks, Link2, Trash2, Upload } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'

type Status = { pending: boolean; message?: string; error?: string }

/** Vignette affichée sur la carte du défi côté élève : image envoyée, ou téléchargée depuis une adresse. */
export function ThumbnailPanel({ activityId, thumbnail }: { activityId: string; thumbnail: string | null }) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [url, setUrl] = useState('')
  const [status, setStatus] = useState<Status>({ pending: false })
  const endpoint = `/api/admin/activites/${activityId}/vignette`

  async function send(init: RequestInit, success: string) {
    setStatus({ pending: true })
    try {
      const res = await fetch(endpoint, init)
      const data = (await res.json().catch(() => ({}))) as { error?: string }
      if (!res.ok) return setStatus({ pending: false, error: data.error ?? 'L’opération a échoué.' })
      setStatus({ pending: false, message: success })
      if (fileRef.current) fileRef.current.value = ''
      setUrl('')
      router.refresh()
    } catch {
      setStatus({ pending: false, error: 'L’opération a échoué. Vérifiez votre connexion.' })
    }
  }

  function sendFile() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setStatus({ pending: false, error: 'Choisissez une image.' })
    void send({ method: 'PUT', body: file, headers: { 'Content-Type': 'application/octet-stream' } }, 'Vignette enregistrée.')
  }

  return (
    <section aria-labelledby="vignette" className="glass space-y-4 p-6">
      <h2 id="vignette" className="text-2xl font-semibold">Vignette</h2>
      <p className="text-muted">Image affichée sur la carte du défi, côté élève. PNG, JPEG, WebP ou GIF, 2 Mo au plus ; elle est redimensionnée automatiquement.</p>

      <div className="grid gap-4 md:grid-cols-[240px_minmax(0,1fr)]">
        <figure className="space-y-2">
          <div className="relative aspect-[16/11] overflow-hidden rounded-[14px] bg-panel shadow-[inset_0_0_0_1.5px_var(--color-line)]">
            {thumbnail
              ? <Image src={thumbnail} alt="Vignette actuelle" fill sizes="240px" className="object-contain p-2" />
              : <Blocks className="absolute inset-0 m-auto size-12 text-sc-looks" aria-hidden />}
          </div>
          <figcaption className="text-sm text-muted">{thumbnail ? 'Vignette actuelle' : 'Aucune vignette : icône par défaut'}</figcaption>
          {thumbnail && (
            <Button variant="ghost" className="text-base" disabled={status.pending}
              onClick={() => void send({ method: 'DELETE' }, 'Vignette retirée.')}>
              <Trash2 className="size-5" aria-hidden />Retirer la vignette
            </Button>
          )}
        </figure>

        <div className="space-y-3">
          <div className="space-y-2 rounded-xl bg-surface p-4">
            <label htmlFor="thumbnail-file" className="block text-sm font-semibold">Envoyer une image</label>
            <input id="thumbnail-file" ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif"
              className="block w-full text-sm file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-primary file:px-4 file:py-2 file:font-semibold file:text-white" />
            <Button onClick={sendFile} disabled={status.pending}><Upload className="size-5" aria-hidden />Envoyer l’image</Button>
          </div>
          <form className="space-y-2 rounded-xl bg-surface p-4" onSubmit={(e) => {
            e.preventDefault()
            void send({ method: 'POST', body: JSON.stringify({ url }), headers: { 'Content-Type': 'application/json' } }, 'Vignette téléchargée et enregistrée.')
          }}>
            <Field label="Ou adresse d’une image" name="thumbnailUrl" type="url" value={url} onChange={(e) => setUrl(e.target.value)}
              placeholder="https://…" hint="Le serveur télécharge l’image une fois : elle ne dépend plus du site d’origine." required />
            <Button type="submit" variant="secondary" disabled={status.pending}><Link2 className="size-5" aria-hidden />Utiliser cette adresse</Button>
          </form>
          {status.pending && <p role="status" className="text-sm font-semibold text-muted">Enregistrement…</p>}
          {status.error && <Alert tone="danger">{status.error}</Alert>}
          {status.message && <Alert tone="success">{status.message}</Alert>}
        </div>
      </div>
    </section>
  )
}
