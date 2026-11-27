import { useEffect, useRef, useState, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { ChevronDown, GripHorizontal, Inbox, Loader2, X } from 'lucide-react'
import * as Dialog from '@radix-ui/react-dialog'
import { cn } from '@/utils/helpers'

// ---------- Button (Apple-standardized 32px height across the app) ----------
type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
const variants: Record<Variant, string> = {
  primary: 'bg-primary text-white hover:bg-primary-hover shadow-sm',
  secondary: 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-50 shadow-sm',
  ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
  danger: 'bg-rose-600 text-white hover:bg-rose-700 shadow-sm',
}
export function Button({ variant = 'secondary', size = 'md', className, ...props }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: 'sm' | 'md' }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-full font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap',
        size === 'sm' ? 'h-8 px-3 text-xs' : 'h-8 px-3.5 text-[13px]',
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
      <div className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${value}%` }} />
      </div>
      <span className="text-xs text-slate-500 w-8 text-right">{value}%</span>
    </div>
  )
}

// ---------- Card ----------
export function Card({ title, action, children, className }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('rounded-2xl border border-slate-200 bg-white shadow-sm', className)}>
      {title && (
        <header className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-slate-100 bg-slate-50/50 rounded-t-2xl">
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
      <Inbox className="h-8 w-8 text-slate-300 mb-2" />
      <p className="text-sm font-medium text-slate-600">{title}</p>
      {hint && <p className="text-xs text-slate-400 mt-1 max-w-sm">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  )
}
export function Loading() {
  return (
    <div className="flex items-center justify-center py-16 text-primary">
      <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading…
    </div>
  )
}

// ---------- Form fields ----------
const inputCls = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/25 focus:border-primary transition-colors'
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
export function AutoResizeTextarea({
  className,
  value,
  onChange,
  rows = 1,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    if (el.scrollHeight > 0) {
      el.style.height = `${el.scrollHeight}px`
    }
  }, [value])

  return (
    <textarea
      ref={ref}
      rows={rows}
      value={value}
      onChange={(e) => {
        onChange?.(e)
        const el = ref.current
        if (el) {
          el.style.height = 'auto'
          if (el.scrollHeight > 0) {
            el.style.height = `${el.scrollHeight}px`
          }
        }
      }}
      className={cn(inputCls, 'resize-none overflow-hidden transition-[height] duration-75 block', className)}
      {...props}
    />
  )
}
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
            'fixed z-50 left-1/2 top-1/2 w-[94vw] max-h-[88vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-2xl',
            compact ? 'max-w-lg' : wide ? 'max-w-2xl' : 'max-w-md',
          )}
        >
          <div
            onMouseDown={startDrag}
            title="Drag to move window"
            className={cn(
              'flex items-center justify-between border-b border-slate-100 sticky top-0 bg-slate-50/80 backdrop-blur-sm cursor-move select-none z-10',
              compact ? 'px-4 py-2.5' : 'px-5 py-3',
            )}
          >
            <div className="flex items-center gap-2 min-w-0">
              <GripHorizontal className="h-4 w-4 text-primary shrink-0" />
              <Dialog.Title className={cn('font-bold text-slate-800 truncate', compact ? 'text-sm' : 'text-base')}>
                {title}
              </Dialog.Title>
            </div>
            <Dialog.Close className="p-1 rounded-full hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 transition-colors" aria-label="Close">
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

// ---------- Left Slide-Over Drawer (island shape, slides over left sidebar without blurring the view) ----------
export function LeftSlideDrawer({
  open,
  onClose,
  title,
  sidePanel,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  sidePanel?: ReactNode
  children: ReactNode
}) {
  const drawerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (drawerRef.current?.contains(target)) return
      // Don't close if clicking another calendar item (which switches the item inside the drawer)
      if (target.closest('[data-calendar-item]')) return
      onClose()
    }
    window.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onMouseDown)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onMouseDown)
    }
  }, [open, onClose])

  return (
    <div
      ref={drawerRef}
      aria-hidden={!open}
      className={cn(
        'fixed inset-y-3 left-3 !mt-0 z-50 max-w-[95vw] flex items-stretch gap-2 transition-transform duration-200 ease-out',
        open ? 'translate-x-0 pointer-events-auto' : '-translate-x-[115%] pointer-events-none',
      )}
    >
      <aside className="w-[330px] max-w-[92vw] bg-white border border-slate-200 shadow-2xl flex flex-col rounded-2xl overflow-hidden shrink-0">
        <div className="flex h-14 items-center justify-between px-4 border-b border-slate-100 bg-slate-50/80 shrink-0">
          <h2 className="text-sm font-bold text-slate-800 truncate">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-slate-200/70 text-slate-600 hover:text-slate-900 transition-colors"
            aria-label="Close"
            title="Close panel"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3.5">{children}</div>
      </aside>
      {sidePanel}
    </div>
  )
}

// ---------- Searchable Select (alphabetically sorted, type-to-filter dropdown) ----------
export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  emptyLabel,
  pill = false,
  className = '',
}: {
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  placeholder?: string
  emptyLabel?: string
  pill?: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const wrapRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const sortedOptions = [...options].sort((a, b) =>
    a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }),
  )
  const selected = sortedOptions.find((o) => o.value === value)
  const q = query.trim().toLowerCase()
  const filtered = q
    ? sortedOptions.filter((o) => o.label.toLowerCase().includes(q))
    : sortedOptions

  useEffect(() => {
    if (!open) return
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) {
        setOpen(false)
        setQuery('')
      }
    }
    document.addEventListener('mousedown', onDocDown)
    return () => document.removeEventListener('mousedown', onDocDown)
  }, [open])

  return (
    <div ref={wrapRef} className={cn('relative', className)}>
      <div
        onClick={() => {
          setOpen(true)
          setTimeout(() => inputRef.current?.focus(), 0)
        }}
        className={cn(
          'flex items-center justify-between gap-1 border border-slate-200 bg-white text-slate-800 cursor-text transition-colors',
          pill ? 'h-8 rounded-full px-3 text-xs' : 'h-8 rounded-lg px-2.5 text-sm w-full',
          open && 'ring-2 ring-primary/30 border-primary',
        )}
      >
        {open ? (
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false)
                setQuery('')
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (filtered.length > 0) {
                  onChange(filtered[0].value)
                  setOpen(false)
                  setQuery('')
                }
              }
            }}
            placeholder={selected ? selected.label : emptyLabel || placeholder}
            className="w-full min-w-0 bg-transparent outline-none text-slate-800 placeholder:text-slate-400"
          />
        ) : (
          <span className={cn('truncate', !selected && 'text-slate-500')}>
            {selected ? selected.label : emptyLabel || placeholder}
          </span>
        )}
        <div className="flex items-center gap-0.5 shrink-0">
          {value && emptyLabel && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                onChange('')
                setQuery('')
              }}
              title="Clear"
              className="p-0.5 text-slate-400 hover:text-slate-700"
            >
              <X className="h-3 w-3" />
            </button>
          )}
          <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
        </div>
      </div>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-1 max-h-56 min-w-[180px] overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
          {emptyLabel && (!q || emptyLabel.toLowerCase().includes(q)) && (
            <button
              type="button"
              onClick={() => {
                onChange('')
                setOpen(false)
                setQuery('')
              }}
              className={cn(
                'w-full px-3 py-1.5 text-left text-xs hover:bg-slate-100',
                !value ? 'font-semibold text-primary bg-primary/5' : 'text-slate-600',
              )}
            >
              {emptyLabel}
            </button>
          )}
          {filtered.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400 italic">No matches</p>
          ) : (
            filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => {
                  onChange(o.value)
                  setOpen(false)
                  setQuery('')
                }}
                className={cn(
                  'w-full px-3 py-1.5 text-left text-xs truncate hover:bg-slate-100',
                  o.value === value ? 'font-semibold text-primary bg-primary/5' : 'text-slate-700',
                )}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
