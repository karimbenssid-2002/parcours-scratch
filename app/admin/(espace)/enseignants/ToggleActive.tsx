'use client'
import { useTransition } from 'react'
import { Button } from '@/components/ui/Button'
import { toggleTeacherActiveAction } from './actions'

export function ToggleActive({ id, isActive }: { id: string; isActive: boolean }) {
  const [pending, start] = useTransition()
  return (
    <Button variant={isActive ? 'secondary' : 'cta'} className="text-base" disabled={pending}
      onClick={() => start(async () => { await toggleTeacherActiveAction(id, !isActive) })}>
      {isActive ? 'Désactiver' : 'Réactiver'}
    </Button>
  )
}
