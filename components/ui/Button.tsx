import type { ButtonHTMLAttributes, Ref } from 'react'

export type ButtonVariant = 'primary' | 'cta' | 'go' | 'secondary' | 'ghost' | 'danger'

// Boutons « Deux encres » : encre bleue pour agir, encre rouge pour envoyer au professeur ou recommencer.
const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary text-white press hover:bg-primary-2',
  cta: 'bg-encre text-white press hover:brightness-95',
  go: 'bg-cta text-white press hover:brightness-110',
  secondary: 'bg-panel text-ink shadow-[inset_0_0_0_1.5px_var(--color-line)] hover:bg-tile-muted active:translate-y-px',
  ghost: 'text-primary-ink hover:bg-primary-wash active:translate-y-px',
  danger: 'bg-danger text-white press hover:brightness-110',
}

export const buttonClasses = (variant: ButtonVariant = 'primary', className = '') =>
  `inline-flex min-h-[42px] items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[15px] font-semibold cursor-pointer transition duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-50 ${variants[variant]} ${className}`

export function Button({ variant = 'primary', className = '', type = 'button', ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; ref?: Ref<HTMLButtonElement> }) {
  return <button type={type} {...props} className={buttonClasses(variant, className)} />
}
