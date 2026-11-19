'use client'
import { createContext, useContext, useState } from 'react'
import { Alert } from '@/components/ui/Alert'

// Message de la dernière suppression d'un élève. Il vit au niveau de la liste, pas dans la ligne : après la
// suppression, la page est rechargée côté serveur et la ligne (avec son bouton) disparaît.
const NoticeContext = createContext<((message: string | undefined) => void) | null>(null)

export function DeletionNoticeArea({ children }: { children: React.ReactNode }) {
  const [notice, setNotice] = useState<string>()
  return (
    <NoticeContext value={setNotice}>
      {notice && <Alert tone="info">{notice}</Alert>}
      {children}
    </NoticeContext>
  )
}

/** Affiche (ou efface, avec undefined) le message au-dessus de la liste ; null hors de DeletionNoticeArea. */
export const useDeletionNotice = () => useContext(NoticeContext)
