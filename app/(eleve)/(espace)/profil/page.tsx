import { LogOut } from 'lucide-react'
import { requireStudent } from '@/lib/auth/session'
import { getDb } from '@/lib/db/client'
import { studentClasses } from '@/lib/db/classes'
import { levelLabel } from '@/lib/levels'

export const metadata = { title: 'Mon profil' }

export default async function ProfilePage() {
  const student = await requireStudent()
  const classes = await studentClasses(getDb(), student.email)
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em] md:text-[46px]">Mon profil</h1>
      <section className="glass p-6">
        <p className="text-lg font-semibold">{student.firstName} {student.lastName}</p>
        <p className="text-muted">{student.email}</p>
        <p className="mt-2">
          {classes.length === 0
            ? 'Ton professeur ne t’a pas encore inscrit dans une classe.'
            : <>Classe{classes.length > 1 ? 's' : ''} : <strong>{classes.map((c) => `${c.name} (${levelLabel(c.level)})`).join(', ')}</strong></>}
        </p>
      </section>
      <p className="text-center text-sm text-muted"><a href="/confidentialite" className="underline">Confidentialité</a></p>
      {/* Sur téléphone, la déconnexion n'est pas dans la barre du haut. */}
      <a href="/deconnexion" className="glass flex items-center gap-3 p-4 font-semibold md:hidden">
        <LogOut className="size-5 text-muted" aria-hidden />Se déconnecter
      </a>
    </div>
  )
}
