import { AuthShell } from '@/components/layout/AuthShell'
import { StudentLoginForm } from './LoginForm'

export const metadata = { title: 'Connexion' }

export default function StudentLoginPage() {
  return (
    <AuthShell area="eleve" title="Bienvenue !" subtitle="Connecte-toi avec ton adresse du lycée.">
      <StudentLoginForm />
    </AuthShell>
  )
}
