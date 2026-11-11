import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { listTeachers } from '@/lib/db/teachers'
import { ToggleActive } from './ToggleActive'

export const metadata = { title: 'Enseignants' }

export default async function TeachersPage() {
  const me = await requireTeacher({ role: 'admin' })
  const teachers = await listTeachers(getDb())
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Enseignants</h1>
      <div className="glass relative overflow-x-auto">
        <table className="w-full text-left">
          <caption className="sr-only">Liste des comptes enseignants</caption>
          <thead className="border-b border-line text-sm text-muted">
            <tr><th className="p-4">Nom</th><th className="p-4">Identifiant</th><th className="p-4">Rôle</th><th className="p-4">Statut</th><th className="p-4"><span className="sr-only">Actions</span></th></tr>
          </thead>
          <tbody>
            {teachers.map((t) => (
              <tr key={t.id} className="border-b border-line last:border-0">
                <td className="p-4 font-semibold">{t.firstName} {t.lastName}<br /><span className="text-sm font-normal text-muted">{t.email}</span></td>
                <td className="p-4">{t.username}</td>
                <td className="p-4">{t.role === 'admin' ? 'Administrateur' : 'Enseignant'}</td>
                <td className="p-4">{!t.isActive ? 'Désactivé' : t.mustChangePassword ? 'Mot de passe provisoire' : 'Actif'}</td>
                <td className="p-4 text-right">{t.id !== me.id && <ToggleActive id={t.id} isActive={t.isActive} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
