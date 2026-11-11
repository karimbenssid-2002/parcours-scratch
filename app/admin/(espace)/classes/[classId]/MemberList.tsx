'use client'
import Link from 'next/link'
import { useTransition } from 'react'
import { UserMinus } from 'lucide-react'
import { removeStudentAction } from '../actions'
import { Button } from '@/components/ui/Button'
import type { ClassMember } from '@/lib/db/classes'

export function MemberList({ classId, members }: { classId: string; members: ClassMember[] }) {
  const [pending, start] = useTransition()
  if (members.length === 0) return <p className="text-muted">Aucun élève dans cette classe pour l'instant.</p>
  return (
    <ul className="glass divide-y divide-line">
      {members.map((m) => (
        <li key={m.email} className="flex flex-wrap items-center gap-3 px-5 py-3">
          <div className="flex-1">
            {m.student ? (
              <Link href={`/admin/suivi/eleves/${m.student.id}`} className="font-semibold text-primary-ink hover:underline">{m.student.firstName} {m.student.lastName}</Link>
            ) : (
              <span className="font-semibold">{m.email}</span>
            )}
            <p className="text-sm text-muted">{m.student ? m.email : 'Pas encore inscrit'}</p>
          </div>
          <Button variant="ghost" className="text-base" disabled={pending} aria-label={`Retirer ${m.email} de la classe`}
            onClick={() => start(() => removeStudentAction(classId, m.email))}>
            <UserMinus className="size-4" aria-hidden />Retirer
          </Button>
        </li>
      ))}
    </ul>
  )
}
