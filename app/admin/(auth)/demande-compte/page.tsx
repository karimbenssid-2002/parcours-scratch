import { AuthShell } from '@/components/layout/AuthShell'
import { RequestForm } from '../RequestForm'

export const metadata = { title: 'Demander un compte' }

export default function RequestAccountPage() {
  return (
    <AuthShell area="admin" title="Demander un compte" subtitle="L'administrateur validera votre demande et vous enverra un mot de passe provisoire.">
      <RequestForm type="registration" submitLabel="Envoyer la demande" />
    </AuthShell>
  )
}
