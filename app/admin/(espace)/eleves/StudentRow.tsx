import Link from 'next/link'
import type { AdminStudentRow } from '@/lib/db/students'
import { levelsLabel } from '@/lib/levels'

export function StudentRow({ student }: { student: AdminStudentRow }) {
  const name = `${student.firstName} ${student.lastName}`
  return (
    <tr className="border-b border-line last:border-0">
      <td className="p-3">
        <Link href={`/admin/suivi/eleves/${student.id}`} className="font-semibold text-primary-ink hover:underline">{name}</Link>
        <p className="text-sm text-muted">{student.email}</p>
      </td>
      <td className="p-3 text-sm">{levelsLabel(student.levels)}</td>
      <td className="p-3 text-sm">{student.classes.length ? student.classes.join(', ') : <span className="text-muted">Aucune</span>}</td>
      <td className="p-3 text-sm text-muted">{student.lastLoginAt ? new Date(student.lastLoginAt).toLocaleDateString('fr-FR') : 'Jamais'}</td>
    </tr>
  )
}
