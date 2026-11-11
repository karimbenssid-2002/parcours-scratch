import { requireStudent } from '@/lib/auth/session'
import { TutoLibrary } from '@/components/tutos/TutoLibrary'

export const metadata = { title: 'Tutos Scratch' }

export default async function TutosPage() {
  await requireStudent()
  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div className="space-y-1">
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em] md:text-[46px]">Tutos Scratch</h1>
        <p className="text-muted">Des vidéos courtes pour comprendre chaque bloc. Bloqué sur un défi ? Cherche le bloc qui te pose problème.</p>
      </div>
      <TutoLibrary />
    </div>
  )
}
