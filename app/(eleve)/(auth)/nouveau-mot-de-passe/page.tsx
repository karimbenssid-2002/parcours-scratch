import { redirect } from 'next/navigation'
import { AuthShell } from '@/components/layout/AuthShell'
import { requireStudent } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { findTeacherById } from '@/lib/db/teachers'
import { ForcedPasswordForm } from './ForcedPasswordForm'

export const metadata = { title: 'Nouveau mot de passe' }

export default async function ForcedPasswordPage() {
  const student = await requireStudent({ allowMustChange: true })
  if (!student.mustChangePassword) redirect('/profil')
  const resetBy = student.passwordResetBy ? await findTeacherById(getDb(), student.passwordResetBy) : null
  return (
    <AuthShell area="eleve" title="Nouveau mot de passe" subtitle="Ton professeur t'a donné un mot de passe provisoire : choisis-en un nouveau.">
      {resetBy && student.passwordResetAt && (
        <p className="mb-4 rounded-xl bg-tile px-4 py-2 text-sm">
          Ton mot de passe a été réinitialisé par {resetBy.firstName} {resetBy.lastName} le {new Date(student.passwordResetAt).toLocaleString('fr-FR')}.
          Si ce n'est pas toi qui l'as demandé, préviens ton professeur.
        </p>
      )}
      <ForcedPasswordForm />
    </AuthShell>
  )
}
