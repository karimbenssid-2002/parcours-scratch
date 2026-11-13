import Link from 'next/link'
import { AuthShell } from '@/components/layout/AuthShell'
import { DevLogin } from '@/components/auth/DevLogin'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { Alert } from '@/components/ui/Alert'
import { getDb } from '@/lib/db/client'
import { devLoginEnabled, listDevTeachers } from '@/lib/auth/dev-login'
import { idleHint, loginErrorMessage, logoutHint } from '@/lib/auth/login-errors'

export const metadata = { title: 'Connexion enseignant' }

export default async function AdminLoginPage({ searchParams }: {
  searchParams: Promise<{ erreur?: string | string[]; deconnexion?: string | string[]; inactivite?: string | string[] }>
}) {
  const { erreur, deconnexion, inactivite } = await searchParams
  const error = loginErrorMessage('enseignant', erreur)
  const hint = idleHint('enseignant', inactivite) ?? logoutHint('enseignant', deconnexion)
  const dev = devLoginEnabled()
  return (
    <AuthShell area="admin" title="Connexion" subtitle="Accès réservé aux enseignants de l'établissement.">
      <div className="space-y-4">
        {hint && <p className="text-center text-sm text-muted">{hint}</p>}
        {error && <Alert tone="danger">{error}</Alert>}
        {dev ? <DevLogin kind="enseignant" accounts={await listDevTeachers(getDb())} /> : <GoogleButton kind="enseignant" />}
        <p className="text-center text-sm text-muted">Avec votre adresse @malraux-rabat.org ou @mlfmonde.org.</p>
        <p className="pt-2 text-center text-sm font-semibold">
          <Link className="text-primary-ink underline-offset-4 hover:underline" href="/admin/demande-compte">Demander un compte</Link>
        </p>
      </div>
    </AuthShell>
  )
}
