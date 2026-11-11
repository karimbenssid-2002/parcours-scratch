import { requireTeacher } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { listPendingRequests } from '@/lib/db/teacher-requests'
import { RequestRow } from './RequestRow'

export const metadata = { title: 'Demandes' }

export default async function RequestsPage() {
  await requireTeacher({ role: 'admin' })
  const requests = await listPendingRequests(getDb())
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Demandes en attente</h1>
      {requests.length === 0 ? (
        <p className="glass p-6 text-muted">Aucune demande à traiter.</p>
      ) : (
        <ul className="space-y-3">{requests.map((r) => <RequestRow key={r.id} request={r} />)}</ul>
      )}
    </div>
  )
}
