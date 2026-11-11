'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { approveRequestAction, rejectRequestAction } from './actions'

type Row = { id: string; type: 'registration' | 'reset'; email: string; createdAt: string }

export function RequestRow({ request }: { request: Row }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ username: string; password: string } | { error: string } | null>(null)

  if (result && 'password' in result)
    return (
      <li className="glass p-5">
        <Alert tone="success">
          Compte prêt pour {request.email}. Identifiant : <strong>{result.username}</strong> · Mot de passe provisoire :{' '}
          <code className="rounded bg-white px-1.5 py-0.5" data-testid="provisional-password">{result.password}</code>
        </Alert>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button variant="ghost" className="text-base" onClick={() => navigator.clipboard.writeText(result.password)}>
            <Copy className="size-4" aria-hidden />Copier le mot de passe
          </Button>
          <Button variant="secondary" className="text-base" onClick={() => router.refresh()}>J'ai noté le mot de passe</Button>
        </div>
        <p className="mt-1 text-sm text-muted">Il ne sera plus affiché. Il a aussi été envoyé par e-mail (console en local).</p>
      </li>
    )

  return (
    <li className="glass flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="font-semibold">{request.email}</p>
        <p className="text-sm text-muted">
          {request.type === 'registration' ? "Demande d'inscription" : 'Réinitialisation du mot de passe'} ·{' '}
          {new Date(request.createdAt).toLocaleString('fr-FR')}
        </p>
        {result && 'error' in result && <p className="mt-1 text-sm font-semibold text-danger">{result.error}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="cta" disabled={pending} onClick={() => start(async () => {
          const r = await approveRequestAction(request.id)
          setResult(r.ok ? { username: r.username, password: r.password } : { error: r.error })
        })}><Check className="size-5" aria-hidden />Valider</Button>
        <Button variant="secondary" disabled={pending} onClick={() => start(() => rejectRequestAction(request.id))}>
          <X className="size-5" aria-hidden />Refuser
        </Button>
      </div>
    </li>
  )
}
