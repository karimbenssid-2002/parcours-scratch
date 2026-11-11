import { CircleAlert, CircleCheck, Info, TriangleAlert } from 'lucide-react'

const tones = {
  danger: { cls: 'bg-st-bad-bg text-st-bad', Icon: CircleAlert, role: 'alert' as const },
  success: { cls: 'bg-st-ok-bg text-st-ok', Icon: CircleCheck, role: 'status' as const },
  info: { cls: 'bg-primary-wash text-primary-ink', Icon: Info, role: 'status' as const },
  warning: { cls: 'bg-st-almost-bg text-st-almost', Icon: TriangleAlert, role: 'status' as const },
}

export function Alert({ tone, children }: { tone: keyof typeof tones; children: React.ReactNode }) {
  const { cls, Icon, role } = tones[tone]
  return (
    <div role={role} className={`flex items-start gap-3 rounded-xl px-4 py-3 font-medium ${cls}`}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div>{children}</div>
    </div>
  )
}
