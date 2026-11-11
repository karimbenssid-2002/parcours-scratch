import { AuthShell } from '@/components/layout/AuthShell'
import { AdminLoginForm } from './LoginForm'

export const metadata = { title: 'Connexion enseignant' }

export default function AdminLoginPage() {
  return (
    <AuthShell area="admin" title="Connexion" subtitle="Accès réservé aux enseignants de l'établissement.">
      <AdminLoginForm />
    </AuthShell>
  )
}
