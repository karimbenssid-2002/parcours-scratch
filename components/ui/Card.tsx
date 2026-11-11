export function Card({ className = '', children }: { className?: string; children: React.ReactNode }) {
  return <div className={`glass p-6 sm:p-8 ${className}`}>{children}</div>
}
