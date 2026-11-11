'use client'
import { useActionState, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Flag, Mail } from 'lucide-react'
import { checkStudentEmail, studentLogin } from '../../actions'
import { Alert } from '@/components/ui/Alert'
import { REGISTRATION_CLOSED } from '@/lib/auth/registration'
import { Button } from '@/components/ui/Button'
import { Field } from '@/components/ui/Field'
import { SubmitButton } from '@/components/ui/SubmitButton'

export function StudentLoginForm() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [step, setStep] = useState<'email' | 'password'>('email')
  const [emailError, setEmailError] = useState<string>()
  const [closed, setClosed] = useState(false) // inscriptions fermées : on ne sait pas (exprès) si le compte existe
  const [checking, startCheck] = useTransition()
  const [state, action] = useActionState(studentLogin, null)

  if (step === 'email')
    return (
      <form className="space-y-4" onSubmit={(e) => {
        e.preventDefault()
        startCheck(async () => {
          const { status } = await checkStudentEmail(email)
          if (status === 'invalid') setEmailError('Utilise ton adresse du lycée : prenom.nom@malraux-rabat.org')
          else if (status === 'blocked') setEmailError('Trop de tentatives. Réessaie dans quelques minutes.')
          else if (status === 'new') router.push(`/premiere-connexion?email=${encodeURIComponent(email.trim())}`)
          else { setEmailError(undefined); setClosed(status === 'closed'); setStep('password') }
        })
      }}>
        <Field label="Ton adresse e-mail du lycée" icon={Mail} name="email" type="email" autoComplete="email" autoFocus
          placeholder="prenom.nom@malraux-rabat.org" value={email} onChange={(e) => setEmail(e.target.value)} error={emailError} required />
        <Button type="submit" variant="go" className="min-h-12 w-full text-[19px]! font-semibold!" disabled={checking}><Flag className="size-5" aria-hidden />Continuer</Button>
      </form>
    )

  return (
    <form action={action} className="space-y-4">
      {state?.error && <Alert tone="danger">{state.error}</Alert>}
      <input type="hidden" name="email" value={email} />
      <p className="rounded-full bg-tile px-4 py-2 font-semibold">{email.trim().toLowerCase()}</p>
      <Field label="Ton mot de passe" name="password" type="password" autoComplete="current-password" autoFocus required />
      <SubmitButton variant="go" className="min-h-12 w-full text-[19px]! font-semibold!" pendingLabel="Connexion…">Se connecter</SubmitButton>
      <Button variant="ghost" className="w-full text-base" onClick={() => setStep('email')}>Changer d'adresse</Button>
      <p className="text-center text-sm text-muted">Mot de passe oublié ? Demande à ton professeur de t'en donner un nouveau.</p>
      {closed && <p className="text-center text-sm text-muted">Pas encore de compte ? {REGISTRATION_CLOSED}</p>}
    </form>
  )
}
