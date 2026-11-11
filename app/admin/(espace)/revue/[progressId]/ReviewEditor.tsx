'use client'
import { ScratchEditor } from '@/components/scratch/ScratchEditor'
import { usePhone } from '@/lib/ui/use-phone'

/** L'enseignant peut lancer et modifier le programme pour le tester : rien n'est jamais enregistré.
 *  Sur téléphone, seul le lecteur (scène et drapeau vert) est affiché. */
export function ReviewEditor({ progressId }: { progressId: string }) {
  const phone = usePhone()
  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        {phone
          ? 'Lancez le programme de l’élève avec le drapeau vert. Pour lire ses blocs, ouvrez ce défi sur un ordinateur.'
          : 'Lancez le programme avec le drapeau vert. Vos éventuelles modifications ne sont pas enregistrées dans la copie de l\'élève.'}
      </p>
      <ScratchEditor key={phone ? 'player' : 'edit'} projectUrl={`/api/revue/${progressId}/projet`} mode={phone ? 'player' : 'edit'} compact={phone} />
    </div>
  )
}
