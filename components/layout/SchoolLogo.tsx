import Image from 'next/image'

// Proportions de l'image source (600 × 221).
const RATIO = 600 / 221

/** Logo du lycée. Bleu sur fond transparent : posé sur une pastille claire pour rester lisible en mode sombre. */
export function SchoolLogo({ height, className = '' }: { height: number; className?: string }) {
  return (
    <span className={`inline-block rounded-2xl bg-thumb px-3 py-2 ${className}`}>
      <Image src="/brand/lycee-malraux.png" alt="Lycée Français International André-Malraux"
        width={Math.round(height * RATIO)} height={height} priority style={{ height, width: 'auto' }} />
    </span>
  )
}
