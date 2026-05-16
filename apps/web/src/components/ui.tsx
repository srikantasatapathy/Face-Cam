import { cn } from '@/lib/cn'
import type { InputHTMLAttributes, LabelHTMLAttributes, SelectHTMLAttributes } from 'react'

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string
  error?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-content">{label}</span>
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-content-muted">{hint}</span>}
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
    </label>
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={cn(
        'w-full rounded-control border border-line bg-surface px-3 py-2 text-content',
        'outline-none focus:border-brand focus:ring-2 focus:ring-brand/25',
        'disabled:cursor-not-allowed disabled:opacity-60',
        className,
      )}
    />
  )
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        'w-full rounded-control border border-line bg-surface px-3 py-2 text-content',
        'outline-none focus:border-brand focus:ring-2 focus:ring-brand/25',
        className,
      )}
    />
  )
}

export function Button({
  variant = 'primary',
  className,
  ...props
}: InputHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'danger' }) {
  const styles = {
    primary: 'bg-brand text-content-inverted hover:opacity-90',
    secondary: 'border border-line bg-surface text-content hover:bg-surface-sunken',
    danger: 'bg-danger text-content-inverted hover:opacity-90',
  }[variant]

  return (
    <button
      {...(props as LabelHTMLAttributes<HTMLButtonElement>)}
      className={cn(
        'rounded-control px-4 py-2 text-sm font-medium transition',
        'disabled:cursor-not-allowed disabled:opacity-60',
        styles,
        className,
      )}
    />
  )
}

export function Alert({
  tone = 'danger',
  children,
}: {
  tone?: 'danger' | 'warning' | 'success'
  children: React.ReactNode
}) {
  const styles = {
    danger: 'border-danger/30 bg-danger/10 text-danger',
    warning: 'border-warning/30 bg-warning/10 text-warning',
    success: 'border-success/30 bg-success/10 text-success',
  }[tone]

  return (
    <div className={cn('rounded-control border px-3 py-2 text-sm', styles)} role="alert">
      {children}
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-success/15 text-success',
  trial: 'bg-brand/15 text-brand',
  past_due: 'bg-warning/15 text-warning',
  suspended: 'bg-danger/15 text-danger',
  cancelled: 'bg-content-muted/15 text-content-muted',
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span
      className={cn(
        'inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize',
        STATUS_STYLES[status] ?? 'bg-content-muted/15 text-content-muted',
      )}
    >
      {status.replace('_', ' ')}
    </span>
  )
}
