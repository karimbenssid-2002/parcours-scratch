import { readTheme } from '@/lib/ui/theme-server'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'

export default async function StudentAuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-area="eleve" data-theme={await readTheme()}>
      {/* Proposition d'installer la web app, dès la page de connexion (téléphones et tablettes). */}
      <div className="px-4 pt-4 empty:hidden"><InstallPrompt /></div>
      {children}
    </div>
  )
}
