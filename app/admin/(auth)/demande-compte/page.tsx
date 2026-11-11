import { AuthShell } from '@/components/layout/AuthShell'
import { RequestForm } from '../RequestForm'

export const metadata = { title: 'Demander un compte' }

export default function RequestAccountPage() {
  return (
    <AuthShell area="admin" title="Demander un compte" subtitle="L'administrateur validera votre demande ; vous vous connecterez ensuite avec votre compte Google du collège.">
      <RequestForm submitLabel="Envoyer la demande" />
    </AuthShell>
  )
}
