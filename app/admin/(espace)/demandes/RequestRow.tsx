'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Alert } from '@/components/ui/Alert'
import { bothAddressesWarning } from '@/lib/auth/identity'
import { approveRequestAction, rejectRequestAction } from './actions'

type Row = { id: string; email: string; createdAt: string }

export function RequestRow({ request }: { request: Row }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [result, setResult] = useState<{ username: string } | { error: string } | null>(null)

  if (result && 'username' in result)
    return (
      <li className="glass p-5">
        <Alert tone="success">
          Compte créé pour {request.email} (identifiant <strong>{result.username}</strong>). Il se connecte avec Google,
          avec son adresse @malraux-rabat.org ou @mlfmonde.org.
        </Alert>
        <div className="mt-2">
          <Button variant="secondary" className="text-base" onClick={() => router.refresh()}>Fermer</Button>
        </div>
      </li>
    )

  return (
    <li className="glass flex flex-col gap-3 p-5 sm:flex-row sm:items-center">
      <div className="flex-1">
        <p className="font-semibold">{request.email}</p>
        <p className="text-sm text-muted">
          Demande d'inscription · {new Date(request.createdAt).toLocaleString('fr-FR')}
        </p>
        <p className="mt-1 break-words text-sm text-muted">{bothAddressesWarning(request.email)}</p>
        {result && 'error' in result && <p className="mt-1 text-sm font-semibold text-danger">{result.error}</p>}
      </div>
      <div className="flex gap-2">
        <Button variant="cta" disabled={pending} onClick={() => start(async () => {
          const r = await approveRequestAction(request.id)
          setResult(r.ok ? { username: r.username } : { error: r.error })
        })}><Check className="size-5" aria-hidden />Valider</Button>
        <Button variant="secondary" disabled={pending} onClick={() => start(() => rejectRequestAction(request.id))}>
          <X className="size-5" aria-hidden />Refuser
        </Button>
      </div>
    </li>
  )
}
