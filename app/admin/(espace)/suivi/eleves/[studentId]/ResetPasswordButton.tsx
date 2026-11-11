'use client'
import { useState, useTransition } from 'react'
import { KeyRound } from 'lucide-react'
import { resetStudentPasswordAction } from './actions'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'

export function ResetPasswordButton({ studentId, studentName }: { studentId: string; studentName: string }) {
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<{ password?: string; error?: string } | null>(null)

  if (result?.password)
    return (
      <Alert tone="success">
        Mot de passe provisoire de {studentName} : <code data-testid="student-provisional-password" className="rounded bg-white px-1.5 py-0.5">{result.password}</code>
        <span className="mt-1 block text-sm font-normal">Communiquez-le à l'élève : il devra en choisir un nouveau à sa prochaine connexion. Il ne sera plus affiché.</span>
      </Alert>
    )

  return (
    <div className="space-y-2">
      {result?.error && <Alert tone="danger">{result.error}</Alert>}
      {confirming ? (
        <div role="alertdialog" aria-label="Confirmation" className="flex flex-wrap items-center gap-2 rounded-xl bg-surface p-3">
          <span className="font-semibold">Remplacer le mot de passe de {studentName} ?</span>
          <Button disabled={pending} onClick={() => start(async () => setResult(await resetStudentPasswordAction(studentId)))}>Oui, générer</Button>
          <Button variant="ghost" onClick={() => setConfirming(false)}>Annuler</Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirming(true)}><KeyRound className="size-5" aria-hidden />Générer un mot de passe provisoire</Button>
      )}
    </div>
  )
}
