import { Modulo } from './Modulo'
import { SchoolLogo } from './SchoolLogo'
import { SourceLink } from './SourceLink'

// Pas de data-area ici : les layouts (auth) le posent déjà, avec le thème choisi par l'élève.
export function AuthShell({ area, title, subtitle, children }: {
  area: 'eleve' | 'admin'; title: string; subtitle?: string; children: React.ReactNode
}) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-[22px] px-4 py-10">
      <div className="glass w-full max-w-[420px] space-y-4 overflow-hidden p-7 pt-0">
        <div aria-hidden className="-mx-7 mb-6 h-2 bg-nav" />
        {/* Logo du lycée centré ; Modulo à gauche dans une colonne symétrique (sur mobile : au-dessus). */}
        <div className="flex flex-col items-center gap-3 sm:grid sm:grid-cols-[1fr_auto_1fr]">
          <Modulo size={56} variant={area === 'admin' ? 'prof' : 'eleve'} className="sm:justify-self-start" />
          <SchoolLogo height={72} />
        </div>
        <div className="text-center">
          <p className="text-[20px] font-semibold leading-tight">Parcours Scratch</p>
          {area === 'admin' && <p className="text-[13px] text-muted">Espace enseignants</p>}
        </div>
        <div className="text-center">
          <h1 className="text-[30px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
          {subtitle && <p className="text-[15px] text-muted">{subtitle}</p>}
        </div>
        <div>{children}</div>
      </div>
      <SourceLink />
    </main>
  )
}
