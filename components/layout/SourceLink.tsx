import { LICENCE, SOURCE_URL } from '@/lib/source'

/** Lien discret vers le code source du site (obligation de la licence AGPL-3.0). */
export function SourceLink({ className = '' }: { className?: string }) {
  return (
    <p className={`text-center text-xs text-muted ${className}`}>
      <a href={SOURCE_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-ink">
        Code source
      </a>
      {' · '}{LICENCE}
    </p>
  )
}
