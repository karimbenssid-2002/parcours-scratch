import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/layout/AuthShell'
import { Alert } from '@/components/ui/Alert'
import { REGISTRATION_CLOSED, studentRegistrationOpen } from '@/lib/auth/registration'
import { isSchoolEmail } from '@/lib/auth/validation'
import { FirstLoginWizard } from './Wizard'

export const metadata = { title: 'Première connexion' }

export default async function FirstLoginPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const { email = '' } = await searchParams // lu d'abord : page rendue à la demande, l'ouverture est lue à l'exécution
  if (!studentRegistrationOpen()) {
    return (
      <AuthShell area="eleve" title="Première connexion">
        <Alert tone="info">{REGISTRATION_CLOSED}</Alert>
      </AuthShell>
    )
  }
  if (!isSchoolEmail(email)) redirect('/connexion')
  return (
    <AuthShell area="eleve" title="Première connexion" subtitle="Crée ton compte en trois petites étapes.">
      <FirstLoginWizard email={email.trim().toLowerCase()} />
    </AuthShell>
  )
}
