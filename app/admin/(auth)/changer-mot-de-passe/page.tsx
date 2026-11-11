import { AuthShell } from '@/components/layout/AuthShell'
import { requireTeacher } from '@/lib/auth/session'
import { ChangePasswordForm } from './ChangePasswordForm'

export const metadata = { title: 'Nouveau mot de passe' }

export default async function ChangePasswordPage() {
  const teacher = await requireTeacher({ allowMustChange: true })
  return (
    <AuthShell area="admin" title="Choisissez votre mot de passe"
      subtitle={teacher.mustChangePassword ? 'Votre mot de passe provisoire doit être remplacé avant de continuer.' : undefined}>
      <ChangePasswordForm requireCurrent={!teacher.mustChangePassword} />
    </AuthShell>
  )
}
