import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { countPendingRequests } from '@/lib/db/teacher-requests'
import { countReviewQueue } from '@/lib/review/service'
import { ensureClosed } from '@/lib/deadlines/ensure'
import { countUnseenNotices } from '@/lib/deadlines/notices'
import { AdminNav } from '@/components/layout/AdminNav'
import { AdminMobileNav } from '@/components/layout/AdminMobileNav'
import { InstallPrompt } from '@/components/pwa/InstallPrompt'
import { AppSessionKeeper } from '@/components/pwa/AppSessionKeeper'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const teacher = await requireTeacher()
  const db = getDb()
  await ensureClosed() // échéances passées rendues (les pages l'appellent aussi : rendu en parallèle)
  const pending = teacher.role === 'admin' ? await countPendingRequests(db) : 0
  // Pastille « À valider » : défis envoyés + alertes de retard non vues.
  const pendingReviews = (await countReviewQueue(db, teacher.id)) + (await countUnseenNotices(db, teacher.id))
  return (
    <div data-area="admin" className="md:flex">
      <AppSessionKeeper app="admin" />
      <AdminNav role={teacher.role} name={`${teacher.firstName} ${teacher.lastName}`} pendingRequests={pending} pendingReviews={pendingReviews} />
      <AdminMobileNav pendingReviews={pendingReviews} pendingRequests={pending} />
      <main className="min-w-0 flex-1 px-3.5 pb-28 pt-5 sm:px-8 md:py-8 lg:px-11"><InstallPrompt audience="prof" />{children}</main>
    </div>
  )
}
