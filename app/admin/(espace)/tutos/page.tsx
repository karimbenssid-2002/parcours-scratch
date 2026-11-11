import { requireTeacher } from '@/lib/auth/session'
import { TutoLibrary } from '@/components/tutos/TutoLibrary'

export const metadata = { title: 'Tutos Scratch' }

export default async function TeacherTutosPage() {
  await requireTeacher()
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Tutos Scratch</h1>
        <p className="text-muted">Les tutos que vos élèves retrouvent dans leur onglet « Tutos Scratch » et dans la rubrique « Besoin d’aide ? » des défis.</p>
      </div>
      <TutoLibrary />
    </div>
  )
}
