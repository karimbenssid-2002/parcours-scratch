import { requireStudent } from '@/lib/auth/session'
import { ensureClosed } from '@/lib/deadlines/ensure'
import { readTheme } from '@/lib/ui/theme-server'
import { StudentNav } from '@/components/layout/StudentNav'
import { StudentTabBar } from '@/components/layout/StudentTabBar'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { AppSessionKeeper } from '@/components/pwa/AppSessionKeeper'

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  const student = await requireStudent()
  await ensureClosed() // échéances passées rendues (les pages l'appellent aussi : rendu en parallèle)
  const theme = await readTheme()
  return (
    <div data-area="eleve" data-theme={theme}>
      <AppSessionKeeper app="eleve" />
      <StudentNav firstName={student.firstName} theme={theme} />
      <div className="flex min-h-[calc(100dvh-4rem)] flex-col px-3.5 pb-28 pt-5 md:px-8 md:pb-8 md:pt-8">
        <InstallPrompt />
        <main className="mx-auto w-full max-w-7xl flex-1">{children}</main>
        <footer className="mx-auto mt-10 w-full max-w-7xl text-center text-sm text-muted">
          Chaque bloc compte. Continue !
        </footer>
      </div>
      <StudentTabBar />
    </div>
  )
}
