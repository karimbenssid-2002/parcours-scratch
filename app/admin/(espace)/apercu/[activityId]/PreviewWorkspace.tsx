'use client'
import { useRef, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { ScratchEditor, type EditorPhase, type ScratchEditorHandle } from '@/components/scratch/ScratchEditor'
import { Button } from '@/components/ui/Button'

/** Éditeur de l'élève sans sauvegarde ni envoi : seul « Recommencer » recharge le projet de départ. */
export function PreviewWorkspace({ activityId }: { activityId: string }) {
  const editorRef = useRef<ScratchEditorHandle>(null)
  const [phase, setPhase] = useState<EditorPhase>('loading')
  return (
    <section aria-label="Espace de travail" className="space-y-3">
      <p className="glass p-4 text-center font-semibold text-muted md:hidden">
        Pour essayer le défi, utilisez un ordinateur ou une tablette en mode paysage.
      </p>
      <div className="hidden space-y-3 md:block">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" onClick={() => void editorRef.current?.reload()} disabled={phase !== 'ready'}>
            <RotateCcw className="size-5" aria-hidden />Recommencer
          </Button>
          <p className="ml-auto text-[13px] font-bold text-muted">Les élèves ont en plus les boutons Sauvegarder et Envoyer.</p>
        </div>
        <ScratchEditor ref={editorRef} projectUrl={`/api/admin/activites/${activityId}/depart`} mode="edit" onPhaseChange={setPhase} />
      </div>
    </section>
  )
}
