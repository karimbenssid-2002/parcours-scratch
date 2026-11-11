'use client'
import { useId, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export function Field({ label, error, hint, id, icon: Icon, type, ...props }:
  InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: string; icon?: React.ComponentType<{ className?: string }> }) {
  const autoId = useId()
  const inputId = id ?? autoId
  const descId = `${inputId}-desc`
  const described = error ?? hint
  // Mot de passe : caché par défaut, l'œil permet de l'afficher pour vérifier ce qu'on a tapé.
  const password = type === 'password'
  const [shown, setShown] = useState(false)
  const ToggleIcon = shown ? EyeOff : Eye
  return (
    <div className="space-y-1.5">
      <label htmlFor={inputId} className="block text-sm font-semibold text-ink">{label}</label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-muted" aria-hidden />}
        <input
          id={inputId}
          type={password && shown ? 'text' : type}
          aria-invalid={error ? true : undefined}
          aria-describedby={described ? descId : undefined}
          {...props}
          className={`w-full rounded-[10px] border-2 border-line bg-tile px-4 py-2.5 text-base text-ink placeholder:text-muted/70 transition duration-200 focus:border-primary focus:outline-none aria-[invalid=true]:border-danger ${Icon ? 'pl-11' : ''} ${password ? 'pr-12' : ''}`}
        />
        {password && (
          <button type="button" onClick={() => setShown((s) => !s)} aria-controls={inputId}
            className="absolute right-1 top-1/2 grid size-10 -translate-y-1/2 cursor-pointer place-items-center rounded-lg text-muted transition hover:bg-tile-muted hover:text-ink">
            <ToggleIcon className="size-5" aria-hidden />
            {/* Nom porté par le texte (et non aria-label) : une recherche de champ par libellé « mot de passe » ne trouve pas ce bouton. */}
            <span className="sr-only">{shown ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}</span>
          </button>
        )}
      </div>
      {described && <p id={descId} className={`text-sm ${error ? 'text-danger' : 'text-muted'}`}>{described}</p>}
    </div>
  )
}
