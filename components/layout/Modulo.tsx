import Image from 'next/image'

/** Mascotte du site : Modulo et le chat Scratch. Décorative (les liens qui l'entourent portent leur propre nom).
 *  Variante « prof » : Modulo enseignant (lunettes, stylo rouge), celui de l'icône de l'appli Scratch Prof. */
export function Modulo({ size, variant = 'eleve', className = '' }: { size: number; variant?: 'eleve' | 'prof'; className?: string }) {
  const src = variant === 'prof' ? '/icons/prof-512.png' : '/brand/modulo.png'
  return <Image src={src} alt="" width={size} height={size} priority className={`shrink-0 object-contain ${variant === 'prof' ? 'rounded-xl' : ''} ${className}`} />
}
