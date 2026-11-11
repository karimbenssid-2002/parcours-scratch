import Link from 'next/link'
import { AuthShell } from '@/components/layout/AuthShell'
import { DevLogin } from '@/components/auth/DevLogin'
import { GoogleButton } from '@/components/auth/GoogleButton'
import { Alert } from '@/components/ui/Alert'
import { getDb } from '@/lib/db/client'
import { devLoginEnabled, listDevStudents } from '@/lib/auth/dev-login'
import { loginErrorMessage, logoutHint } from '@/lib/auth/login-errors'

export const metadata = { title: 'Connexion' }

export default async function StudentLoginPage({ searchParams }: {
  searchParams: Promise<{ erreur?: string | string[]; deconnexion?: string | string[] }>
}) {
  const { erreur, deconnexion } = await searchParams
  const error = loginErrorMessage('eleve', erreur)
  const hint = logoutHint('eleve', deconnexion)
  const dev = devLoginEnabled()
  return (
    <AuthShell area="eleve" title="Bienvenue !" subtitle="Connecte-toi avec ton compte Google du collège.">
      <div className="space-y-4">
        {hint && <p className="text-center text-sm text-muted">{hint}</p>}
        {error && (
          <Alert tone="danger">
            {error}
            {/* Sans connexion en cours, le retour de Google ne sait pas de quelle page on venait : il arrive ici. */}
            {erreur === 'expire' && (
              <> <Link className="underline underline-offset-4" href="/admin/login">Vous êtes enseignant ?</Link></>
            )}
          </Alert>
        )}
        {dev ? <DevLogin kind="eleve" accounts={await listDevStudents(getDb())} /> : <GoogleButton kind="eleve" />}
        <p className="text-center text-sm text-muted">Utilise ton adresse prenom.nom@malraux-rabat.org.</p>
      </div>
    </AuthShell>
  )
}
