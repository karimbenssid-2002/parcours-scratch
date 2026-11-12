'use client'
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react'
import { Loader2, TriangleAlert } from 'lucide-react'
import { getBridge } from '@/lib/scratch/bridge'

// Taille en dessous de laquelle l'interface de Scratch déborde de sa fenêtre (scène et lutins coupés).
const MIN_WIDTH = 1024
const MIN_HEIGHT = 640

export type EditorPhase = 'loading' | 'ready' | 'error'

export type ScratchEditorHandle = {
  getSb3(): Promise<Uint8Array<ArrayBuffer>>
  markSaved(): void
  reload(): Promise<void>
}

type Props = {
  projectUrl: string
  mode: 'edit' | 'player'
  onChangeState?: (hasChanges: boolean) => void
  onPhaseChange?: (phase: EditorPhase) => void
  /** Lecteur seul, à la taille de la scène (téléphone) : ni hauteur minimale ni réduction. */
  compact?: boolean
  ref?: Ref<ScratchEditorHandle>
}

/** Éditeur Scratch dans une iframe de même origine. Changer de `mode` impose de remonter le composant (prop `key`). */
export function ScratchEditor({ projectUrl, mode, onChangeState, onPhaseChange, compact = false, ref }: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState<{ width: number; height: number }>()
  const onChangeRef = useRef(onChangeState)
  const [phase, setPhase] = useState<EditorPhase>('loading')

  useEffect(() => {
    onChangeRef.current = onChangeState
  }, [onChangeState])

  useEffect(() => {
    onPhaseChange?.(phase)
  }, [phase, onPhaseChange])

  useEffect(() => {
    let started = false
    let cancelled = false
    let unsubscribe: (() => void) | undefined
    async function start() {
      const bridge = getBridge(iframeRef.current)
      if (!bridge || started) return
      started = true
      try {
        await bridge.load(projectUrl)
        if (cancelled) return
        unsubscribe = bridge.onChange((changed) => onChangeRef.current?.(changed))
        setPhase('ready')
      } catch {
        if (!cancelled) setPhase('error')
      }
    }
    function onMessage(event: MessageEvent) {
      if (event.origin === window.location.origin && event.source === iframeRef.current?.contentWindow && event.data?.type === 'scratch-ready') void start()
    }
    window.addEventListener('message', onMessage)
    void start() // l'éditeur était peut-être déjà prêt
    return () => {
      cancelled = true
      unsubscribe?.()
      window.removeEventListener('message', onMessage)
    }
  }, [projectUrl])

  // Si la place manque (petit écran, zoom du navigateur), l'éditeur est affiché à sa taille minimale puis réduit
  // pour tenir en entier. Une transformation CSS de l'iframe garde le glisser-déposer et les clics justes.
  useEffect(() => {
    const element = boxRef.current
    if (!element) return
    const observer = new ResizeObserver(() => setBox({ width: element.clientWidth, height: element.clientHeight }))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // Boîte masquée (largeur nulle) : pas de réduction, sinon les dimensions calculées deviennent infinies.
  const scale = box && !compact && box.width > 0 && box.height > 0 ? Math.min(1, box.width / MIN_WIDTH, box.height / MIN_HEIGHT) : 1
  const frameStyle = box && scale < 1
    ? { width: box.width / scale, height: box.height / scale, transform: `scale(${scale})`, transformOrigin: '0 0' }
    : undefined

  useImperativeHandle(ref, () => ({
    async getSb3() {
      const bridge = getBridge(iframeRef.current)
      if (!bridge) throw new Error("L'éditeur n'est pas prêt.")
      return bridge.getSb3()
    },
    markSaved() {
      getBridge(iframeRef.current)?.markSaved()
    },
    async reload() {
      const bridge = getBridge(iframeRef.current)
      if (!bridge) return
      setPhase('loading')
      try {
        await bridge.load(projectUrl)
        setPhase('ready')
      } catch {
        setPhase('error')
      }
    },
  }), [projectUrl])

  return (
    // Cadre blanc de carte : bordure de la boîte mesurée elle-même (pas de conteneur supplémentaire).
    <div ref={boxRef} className={`relative overflow-hidden rounded-2xl border-8 border-panel bg-white shadow-clay ${compact ? 'aspect-[4/3.45] w-full' : 'h-[75vh] min-h-[560px]'}`}>
      <iframe ref={iframeRef} src={`/scratch-editor/editor.html?mode=${mode}`} title="Éditeur Scratch"
        // Réduite, l'iframe est sortie du flux : sa largeur agrandie ne doit pas élargir la boîte mesurée (sinon
        // boucle : boîte plus large → iframe plus large → … quand le parent n'a pas de largeur fixée).
        className={frameStyle ? 'absolute left-0 top-0 block' : 'block size-full'} style={frameStyle} />
      {phase !== 'ready' && (
        <div className="absolute inset-0 grid place-items-center bg-white/90" role="status">
          {phase === 'loading' ? (
            <p className="flex items-center gap-3 text-xl font-medium text-[#1e3f9e]">
              <Loader2 className="size-6 animate-spin" aria-hidden />Chargement de l'éditeur Scratch…
            </p>
          ) : (
            <p className="flex items-center gap-3 font-semibold text-danger">
              <TriangleAlert className="size-6" aria-hidden />Impossible de charger le projet. Recharge la page.
            </p>
          )}
        </div>
      )}
    </div>
  )
}
