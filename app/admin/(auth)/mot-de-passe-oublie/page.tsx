import { AuthShell } from '@/components/layout/AuthShell'
import { RequestForm } from '../RequestForm'

export const metadata = { title: 'Mot de passe oublié' }

export default function ForgotPasswordPage() {
  return (
    <AuthShell area="admin" title="Mot de passe oublié" subtitle="Après validation, vous recevrez un nouveau mot de passe provisoire.">
      <RequestForm type="reset" submitLabel="Demander un nouveau mot de passe" />
    </AuthShell>
  )
}
