'use client'
import { useActionState, useState } from 'react'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { registerStudent } from '../../actions'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function FirstLoginWizard({ email }: { email: string }) {
  const [step, setStep] = useState<1 | 2>(1)
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [pwError, setPwError] = useState<string>()
  const [state, action] = useActionState(registerStudent, null)

  return (
    <div className="space-y-5">
      <ol className="flex gap-2" aria-label="Étapes">
        {[1, 2].map((n) => (
          <li key={n} aria-current={n === step ? 'step' : undefined}
            className={`h-2 flex-1 rounded-full ${n <= step ? 'bg-primary' : 'bg-primary-soft/30'}`}>
            <span className="sr-only">Étape {n}{n === step ? ' (en cours)' : ''}</span>
          </li>
        ))}
      </ol>
      <p className="rounded-full bg-tile px-4 py-2 font-semibold">{email}</p>

      {step === 1 && (
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault()
          if (password.length < 8) return setPwError('Au moins 8 caractères.')
          if (password !== confirm) return setPwError('Les deux mots de passe ne sont pas identiques.')
          setPwError(undefined)
          setStep(2)
        }}>
          <Field label="Choisis ton mot de passe" type="password" autoComplete="new-password" autoFocus value={password}
            onChange={(e) => setPassword(e.target.value)} hint="8 caractères minimum. Garde-le secret !" required />
          <Field label="Écris-le une deuxième fois" type="password" autoComplete="new-password" value={confirm}
            onChange={(e) => setConfirm(e.target.value)} error={pwError} required />
          <Button type="submit" className="w-full">Suivant<ArrowRight className="size-5" aria-hidden /></Button>
        </form>
      )}

      {step === 2 && (
        <form action={action} className="space-y-4">
          {state?.error && <Alert tone="danger">{state.error}</Alert>}
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="password" value={password} />
          <input type="hidden" name="confirm" value={confirm} />
          <div className="rounded-2xl bg-tile p-5 text-center">
            <p className="text-lg font-semibold">Ton mot de passe est prêt.</p>
            <p className="mt-2 text-sm text-muted">Tu verras les défis que ton professeur te donne.</p>
          </div>
          <SubmitButton variant="cta" className="w-full" pendingLabel="Création du compte…">Créer mon compte</SubmitButton>
          <Button variant="secondary" className="w-full" onClick={() => setStep(1)}><ArrowLeft className="size-5" aria-hidden />Retour</Button>
        </form>
      )}
    </div>
  )
}
