import { InstallPrompt } from '@/components/pwa/InstallPrompt'

export default function AdminAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-area="admin" className="min-h-dvh">
      {/* Proposition d'installer la web app, dès la page de connexion (téléphones et tablettes). */}
      <div className="px-4 pt-4 empty:hidden"><InstallPrompt audience="prof" /></div>
      {children}
    </div>
  )
}
