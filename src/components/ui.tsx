import { useEffect, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { GripHorizontal, Inbox, Loader2, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/utils/helpers'

// ---------- Button ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm hover:shadow',
  secondary: 'bg-white text-emerald-900 border border-emerald-200 hover:bg-emerald-50/80 hover:border-emerald-300 shadow-sm',
  ghost: 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-800',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
}
export function Button({ variant = 'secondary', size = 'md', className, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-9 px-4 text-sm',
        variants[variant], className,
      )}
    />
  )
}

// ---------- Badge ----------
const badgeColors: Record<string, string> = {
  grey: 'bg-slate-100 text-slate-600',
  blue: 'bg-sky-50 text-sky-700',
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  violet: 'bg-teal-50 text-teal-700',
  indigo: 'bg-emerald-50 text-emerald-800 border border-emerald-200/70',
  slate: 'bg-slate-100 text-slate-700',
}
const statusColor: Record<string, string> = {
  Planning: 'violet', 'In Progress': 'blue', 'On Hold': 'amber', Delayed: 'red', Completed: 'green', Cancelled: 'grey',
  'Not Started': 'grey', Low: 'grey', Medium: 'blue', High: 'amber', Critical: 'red',
  Done: 'green', 'On Track': 'green', Watch: 'amber', Risk: 'red', Urgent: 'red',
}
export function Badge({ children, color }: { children: ReactNode; color?: string }) {
  const key = color ?? statusColor[String(children)] ?? 'grey'
  return <span className={cn('inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', badgeColors[key] ?? badgeColors.grey)}>{children}</span>
}

// ---------- Progress bar ----------
export function ProgressBar({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[90px]">
      <div className="h-1.5 flex-1 rounded-full bg-emerald-100 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{value}%</span>
    </div>
  )
}

// ---------- Card ----------
export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-xl border border-emerald-200/80 bg-white shadow-sm', className)}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-emerald-100 bg-emerald-50/40 rounded-t-xl">
          <h2 className="text-sm font-bold text-slate-800 tracking-tight">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  )
}

// ---------- States ----------
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-10 text-center">
      <Inbox className="h-8 w-8 text-emerald-300 mb-2" />
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
export function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-emerald-600">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
    </div>
  )
}

// ---------- Form fields ----------
const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-colors'
export function Field({ label, children, required }: { label: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="block text-xs font-semibold text-slate-600 mb-1">{label}{required && <span className="text-rose-500"> *</span>}</span>
      {children}
    </label>
  )
}
export const Input = (p: InputHTMLAttributes<HTMLInputElement>) => <input {...p} className={cn(inputCls, p.className)} />
export const Textarea = (p: TextareaHTMLAttributes<HTMLTextAreaElement>) => <textarea rows={2} {...p} className={cn(inputCls, p.className)} />
export function Select({ options, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { options: readonly (string | { value: string; label: string })[] }) {
  return (
    <select {...p} className={cn(inputCls, p.className)}>
      {options.map((o) => {
        const v = typeof o === 'string' ? { value: o, label: o } : o
        return <option key={v.value} value={v.value}>{v.label}</option>
      })}
    </select>
  )
}

// ---------- Modal (Moveable by dragging header, supports compact mode) ----------
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
  compact,
}: {
  open: boolean
  onClose: () => void
  title: string
  children: ReactNode
  wide?: boolean
  compact?: boolean
}) {
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  useEffect(() => {
    if (open) setOffset({ x: 0, y: 0 })
  }, [open])

  function startDrag(e: React.MouseEvent<HTMLDivElement>) {
    if ((e.target as HTMLElement).closest('button')) return
    e.preventDefault()
    const startX = e.clientX
    const startY = e.clientY
    const orig = { ...offset }

    const onMove = (ev: MouseEvent) => {
      setOffset({ x: orig.x + (ev.clientX - startX), y: orig.y + (ev.clientY - startY) })
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/35 backdrop-blur-[1px] z-40" />
        <Dialog.Content
          aria-describedby={undefined}
          style={{ transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))` }}
          className={cn(
            'fixed z-50 left-1/2 top-1/2 w-[94vw] max-h-[88vh] overflow-y-auto rounded-xl border border-emerald-200 bg-white shadow-2xl',
            compact ? 'max-w-lg' : wide ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div
            onMouseDown={startDrag}
            title="Drag to move window"
            className={cn(
              'flex items-center justify-between border-b border-emerald-100 sticky top-0 bg-emerald-50/70 backdrop-blur-sm cursor-move select-none z-10',
              compact ? 'px-4 py-2.5' : 'px-5 py-3',
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="h-4 w-4 text-emerald-500 shrink-0" />
              <Dialog.Title className={cn('font-bold text-slate-800 truncate', compact ? 'text-sm' : 'text-base')}>
                {title}
              </Dialog.Title>
            </div>
            <Dialog.Close className="p-1 rounded-lg hover:bg-emerald-100 text-slate-500 hover:text-slate-800 transition-colors" aria-label="Close">
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>
          <div className={compact ? 'p-3.5' : 'p-5'}>{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export function ConfirmDialog({ open, title, message, confirmLabel = 'Delete', onConfirm, onCancel }:
  { open: boolean; title: string; message: ReactNode; confirmLabel?: string; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal open={open} onClose={onCancel} title={title} compact>
      <div className="text-sm text-slate-600">{message}</div>
      <div className="flex justify-end gap-2 mt-4">
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="danger" onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Modal>
  )
}

export function FormError({ message }: { message: string }) {
  return message ? <p className="rounded-lg bg-rose-50 border border-rose-200 px-3 py-2 text-xs text-rose-700">{message}</p> : null
}
