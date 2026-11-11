import type { Metadata, Viewport } from 'next'
import { Kalam, Lexend } from 'next/font/google'
import './globals.css'

const lexend = Lexend({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-lexend' })
// Écriture manuscrite : réservée aux appréciations du professeur.
const kalam = Kalam({ subsets: ['latin'], weight: ['400', '700'], variable: '--font-kalam' })

export const metadata: Metadata = {
  title: { default: 'Parcours Scratch — Lycée International André Malraux', template: '%s · Parcours Scratch' },
  description: 'Défis Scratch par niveau pour les collégiens du Lycée International André Malraux (Rabat).',
  applicationName: 'Parcours Scratch',
  // iPhone / iPad : icône et plein écran une fois ajoutée à l'écran d'accueil.
  appleWebApp: { capable: true, title: 'Parcours Scratch', statusBarStyle: 'default' },
  icons: { apple: '/icons/apple-touch-icon.png' },
  // Site d'établissement (élèves mineurs) : jamais dans les moteurs de recherche.
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: '#1e3f9e',
  viewportFit: 'cover', // barre d'onglets au-dessus de la zone du geste d'accueil (iPhone)
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={`${lexend.variable} ${kalam.variable}`}>
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  )
}
