'use client'
import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'
import { Alert } from '@/components/ui/Alert'
import { Button } from '@/components/ui/Button'
import { deleteStudent } from './actions'
import { useDeletionNotice } from './DeletionNotice'

/**
 * Bouton « Supprimer » avec confirmation ; l'erreur éventuelle (rien n'est effacé) s'affiche sous la ligne. Le message
 * d'une suppression réussie (fichiers effacés plus tard) s'affiche au-dessus de la liste : la ligne disparaît.
 */
export function DeleteStudentButton({ studentId, name }: { studentId: string; name: string }) {
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState<string>()
  const [pending, start] = useTransition()
  const showNotice = useDeletionNotice()
  return (
    <>
      <Button variant="ghost" className="min-h-9 px-3 py-1 text-sm" aria-label={`Supprimer ${name}`} disabled={pending}
        aria-expanded={confirming} onClick={() => { setError(undefined); setConfirming(true) }}>
        <Trash2 className="size-4" aria-hidden />Supprimer
      </Button>
      {confirming && (
        <div role="alertdialog" aria-label="Confirmer la suppression" className="mt-2 space-y-2 rounded-xl bg-st-bad-bg p-3 text-left">
          <p className="text-sm font-semibold text-st-bad">
            Supprimer {name} ? Son compte, ses projets et ses retours seront effacés, et son adresse retirée de toutes les classes. C'est définitif.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" className="min-h-9 px-3 py-1 text-sm" disabled={pending}
              onClick={() => start(async () => {
                const r: { error?: string; notice?: string } = await deleteStudent(studentId)
                  .catch(() => ({ error: 'La suppression a échoué. Rechargez la page.' }))
                setConfirming(false)
                if (r.error) setError(r.error)
                else showNotice?.(r.notice)
              })}>Supprimer</Button>
            <Button variant="secondary" className="min-h-9 px-3 py-1 text-sm" autoFocus disabled={pending} onClick={() => setConfirming(false)}>Annuler</Button>
          </div>
        </div>
      )}
      {error && <div className="mt-2 text-left"><Alert tone="danger">{error}</Alert></div>}
    </>
  )
}
