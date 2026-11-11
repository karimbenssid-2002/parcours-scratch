import Link from 'next/link'
import { Users } from 'lucide-react'
import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { listClassesForTeacher } from '@/lib/db/classes'
import { levelLabel } from '@/lib/levels'
import { ClassCreateForm } from './ClassCreateForm'

export const metadata = { title: 'Mes classes' }

export default async function ClassesPage() {
  const teacher = await requireTeacher()
  const list = await listClassesForTeacher(getDb(), teacher.id)
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Mes classes</h1>
      <ClassCreateForm />
      {list.length === 0 ? (
        <p className="glass p-6 text-muted">Vous n'avez pas encore de classe. Créez-en une, puis ajoutez vos élèves par leur adresse e-mail.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {list.map((c) => (
            <li key={c.id}>
              <Link href={`/admin/classes/${c.id}`} className="glass flex items-center gap-4 p-5 transition hover:-translate-y-0.5">
                <span className="grid size-12 place-items-center rounded-xl bg-surface text-primary"><Users className="size-6" aria-hidden /></span>
                <span>
                  <span className="block text-xl font-semibold">{c.name}</span>
                  <span className="text-sm text-muted">{levelLabel(c.level)} · {c.studentCount} élève{c.studentCount > 1 ? 's' : ''}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
