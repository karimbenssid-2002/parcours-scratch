/** API exposée par public/scratch-editor/editor.html (window.scratchBridge, iframe de même origine). */
export type ScratchBridge = {
  ready: boolean
  mode: 'edit' | 'player'
  load(url: string): Promise<void>
  getSb3(): Promise<Uint8Array<ArrayBuffer>>
  markSaved(): void
  hasChanges(): boolean
  onChange(cb: (changed: boolean) => void): () => void
  greenFlag(): void
  spriteNames(): string[]
}

export function getBridge(iframe: HTMLIFrameElement | null): ScratchBridge | null {
  const win = iframe?.contentWindow as (Window & { scratchBridge?: ScratchBridge }) | null | undefined
  return win?.scratchBridge?.ready ? win.scratchBridge : null
}
