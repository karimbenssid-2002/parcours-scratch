'use client'
import { useFormStatus } from 'react-dom'
import { Loader2 } from 'lucide-react'
import { Button, type ButtonVariant } from './Button'

export function SubmitButton({ children, pendingLabel, variant = 'primary', className = '', name, value }: {
  children: React.ReactNode; pendingLabel: string; variant?: ButtonVariant; className?: string; name?: string; value?: string
}) {
  const { pending } = useFormStatus()
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending} aria-disabled={pending} name={name} value={value}>
      {pending ? (<><Loader2 className="size-5 animate-spin" aria-hidden />{pendingLabel}</>) : children}
    </Button>
  )
}
