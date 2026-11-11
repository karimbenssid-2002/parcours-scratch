import { Eye } from 'lucide-react'
import { buttonClasses } from '@/components/ui/Button'

/** Ouvre l'aperçu élève dans un nouvel onglet : la sélection en cours reste intacte. */
export function PreviewLink({ activityId, title }: { activityId: string; title: string }) {
  return (
    <a href={`/admin/apercu/${activityId}`} target="_blank" rel="noopener" aria-label={`Aperçu de ${title} (nouvel onglet)`}
      className={buttonClasses('ghost', 'min-h-9 shrink-0 px-2 py-1 text-sm')}>
      <Eye className="size-4" aria-hidden /><span className="max-sm:sr-only">Aperçu</span>
    </a>
  )
}
