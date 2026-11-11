import Image from 'next/image'

/** Mascotte du site : Modulo et le chat Scratch. Décorative (les liens qui l'entourent portent leur propre nom). */
export function Modulo({ size, className = '' }: { size: number; className?: string }) {
  return <Image src="/brand/modulo.png" alt="" width={size} height={size} priority className={`shrink-0 object-contain ${className}`} />
}
