import type { Metadata } from 'next'

// Espace enseignant : sa propre web app (icône et démarrage sur /admin), distincte de l'appli élève.
export const metadata: Metadata = {
  manifest: '/admin/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Scratch Prof', statusBarStyle: 'default' },
  icons: { apple: '/icons/prof-apple-touch-icon.png' },
}

export default function AdminRootLayout({ children }: { children: React.ReactNode }) {
  return children
}
