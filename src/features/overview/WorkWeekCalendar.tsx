import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, CalendarDays, Check, CheckSquare, ChevronLeft, ChevronRight, ClipboardPaste, Clock, Copy, Flag, GripVertical, Scissors, X } from 'lucide-react'
import type { Milestone, Priority, Project, Task } from '@/types'
import { Badge, Button, Card } from '@/components/ui'
import { usePersistedState } from '@/hooks/usePersistedState'
import { duplicateTaskToDate, rescheduleTask, updateTasksPriority } from '@/services/taskService'
import { duplicateMilestoneToDate, rescheduleMilestone } from '@/services/milestoneService'
import { cn, todayStr } from '@/utils/helpers'
import { OutlookWeekHourlyView, type CalendarClipboard, type CalendarItemRef } from './OutlookWeekHourlyView'

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'] as const
const MINI_DAYS = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'] as const

export function toYmd(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(d: Date, n: number): Date {
  const out = new Date(d)
  out.setDate(out.getDate() + n)
  return out
}

/** Returns the Monday of the week for `d`. */
export function getMondayOfWeek(d: Date): Date {
  const copy = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const day = copy.getDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const diff = day === 0 ? -6 : 1 - day
  copy.setDate(copy.getDate() + diff)
  return copy
}

/** ISO 8601 week number (1..53) */
export function getIsoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

/** Maps any date (including Sat/Sun) into the 5-day workweek (Sat/Sun snap to Friday of that workweek). */
function snapToWorkdayYmd(ymd: string): string {
  const d = parseYmd(ymd)
  const dow = d.getDay()
  if (dow === 6) return toYmd(addDays(d, -1))
  if (dow === 0) return toYmd(addDays(d, -2))
  return ymd
}

/** Builds a calendar grid for the given month.
 *  `hideEndOverflow`: blanks out days after the last day of `month` (used at the end of the 1st mini calendar).
 *  `hideStartOverflow`: blanks out days before the 1st day of `month` (used at the beginning of the 2nd mini calendar).
 */
function buildMiniMonthWeeks(year: number, month: number, opts: { hideStartOverflow?: boolean; hideEndOverflow?: boolean }) {
  const firstOfMonth = new Date(year, month, 1)
  const lastOfMonth = new Date(year, month + 1, 0)
  const startMonday = getMondayOfWeek(firstOfMonth)
  const rows: {
    ww: number
    monday: Date
    mondayYmd: string
    days: { date: Date; ymd: string; dayNum: number; inMonth: boolean; isWeekday: boolean; hidden: boolean }[]
  }[] = []

  let cur = startMonday
  while (cur <= lastOfMonth) {
    const monday = new Date(cur)
    const ww = getIsoWeek(monday)
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = addDays(monday, i)
      const beforeMonth = d < firstOfMonth
      const afterMonth = d > lastOfMonth
      const hidden = !!(opts.hideStartOverflow && beforeMonth) || !!(opts.hideEndOverflow && afterMonth)
      return {
        date: d,
        ymd: toYmd(d),
        dayNum: d.getDate(),
        inMonth: d.getMonth() === month,
        isWeekday: i < 5,
        hidden,
      }
    })
    rows.push({ ww, monday, mondayYmd: toYmd(monday), days })
    cur = addDays(cur, 7)
  }
  return {
    title: firstOfMonth.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }),
    rows,
  }
}

interface ItemRef {
  kind: 'task' | 'milestone'
  id: string
  name: string
}

const PRIORITY_RANK: Record<Priority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}

const PRIORITY_LEGEND: { priority: Priority; boxCls: string }[] = [
  { priority: 'Critical', boxCls: 'bg-rose-500 border-rose-700' },
  { priority: 'High', boxCls: 'bg-amber-400 border-amber-600' },
  { priority: 'Medium', boxCls: 'bg-sky-500 border-sky-700' },
  { priority: 'Low', boxCls: 'bg-slate-400 border-slate-600' },
]

// Task colour is driven by Priority (Completed stays emerald green).
function taskCardStyle(t: Task, _today: string): string {
  if (t.status === 'Completed') {
    return 'border-emerald-400 border-l-4 border-l-emerald-600 bg-emerald-100/90 text-emerald-950'
  }
  switch (t.priority) {
    case 'Critical':
      return 'border-rose-400 border-l-4 border-l-rose-600 bg-rose-100/90 text-rose-950'
    case 'High':
      return 'border-amber-400 border-l-4 border-l-amber-500 bg-amber-100/90 text-amber-950'
    case 'Medium':
      return 'border-sky-400 border-l-4 border-l-sky-600 bg-sky-100/90 text-sky-950'
    case 'Low':
    default:
      return 'border-slate-300 border-l-4 border-l-slate-500 bg-slate-100 text-slate-900'
  }
}

function milestoneCardStyle(m: Milestone, today: string): string {
  if (m.status === 'Completed') {
    return 'border-emerald-500 border-l-4 border-l-emerald-700 bg-emerald-200/80 text-emerald-950'
  }
  if (m.status === 'Delayed' || (m.targetDate && m.targetDate < today)) {
    return 'border-rose-500 border-l-4 border-l-rose-700 bg-rose-100 text-rose-950'
  }
  return 'border-purple-500 border-l-4 border-l-purple-700 bg-purple-100/95 text-purple-950'
}

export function WorkWeekCalendar({
  tasks,
  milestones,
  projects,
  baseMonday: controlledMonday,
  onBaseMondayChange,
  onEditTask,
  onEditMilestone,
}: {
  tasks: Task[]
  milestones: Milestone[]
  projects: Project[]
  baseMonday?: Date
  onBaseMondayChange?: (d: Date) => void
  onEditTask?: (t: Task) => void
  onEditMilestone?: (m: Milestone) => void
}) {
  const today = todayStr()
  // Start at current week's Monday by default; Prev/Next jumps by 1 month
  const [internalMonday, setInternalMonday] = useState<Date>(() => getMondayOfWeek(parseYmd(today)))
  const baseMonday = controlledMonday ?? internalMonday
  const setBaseMonday = (updater: Date | ((prev: Date) => Date)) => {
    const next = typeof updater === 'function' ? updater(baseMonday) : updater
    setInternalMonday(next)
    onBaseMondayChange?.(next)
  }
  // View mode: 'multi' (1-10 weeks grid) or 'week' (Outlook-style 1-week Mon-Fri hourly view)
  const [viewMode, setViewMode] = usePersistedState<'multi' | 'week'>('npi.calendar.viewMode', 'multi')
  // Customizable number of weeks (1..10, default 4) — saved in localStorage
  const [weeksToShow, setWeeksToShow] = usePersistedState<number>('npi.calendar.weeksToShow', 4)
  const [filterProject, setFilterProject] = usePersistedState<string>('npi.calendar.filterProject', '')
  const [dragOverCell, setDragOverCell] = useState<string>('')
  const [draggingId, setDraggingId] = useState<string>('')
  const [selectedItems, setSelectedItems] = useState<CalendarItemRef[]>([])
  const [selectedDay, setSelectedDay] = useState<string>(today)
  const [clipboard, setClipboard] = useState<CalendarClipboard | null>(null)
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null)
  const [toast, setToast] = useState<string>('')

  const selectedIds = useMemo(() => new Set(selectedItems.map((i) => i.id)), [selectedItems])

  const showToast = (msg: string) => {
    setToast(msg)
    setTimeout(() => setToast((t) => (t === msg ? '' : t)), 2800)
  }

  // Navigate by 1 full month (snapped to the Monday of that week)
  function shiftMonth(deltaMonths: number) {
    setBaseMonday((prev) => {
      const target = new Date(prev.getFullYear(), prev.getMonth() + deltaMonths, prev.getDate())
      return getMondayOfWeek(target)
    })
  }

  // Navigate by 1 week (used in Weekly Hours view)
  function shiftWeek(deltaWeeks: number) {
    setBaseMonday((prev) => addDays(prev, deltaWeeks * 7))
  }

  function goToCurrentWeek() {
    setBaseMonday(getMondayOfWeek(parseYmd(today)))
  }

  const weeks = useMemo(() => {
    const count = viewMode === 'week' ? 1 : Math.max(4, Math.min(10, weeksToShow))
    return Array.from({ length: count }, (_, wIdx) => {
      const monday = addDays(baseMonday, wIdx * 7)
      const ww = getIsoWeek(monday)
      const days = Array.from({ length: 5 }, (__, dIdx) => {
        const dateObj = addDays(monday, dIdx)
        const ymd = toYmd(dateObj)
        return {
          ymd,
          dayName: DAY_NAMES[dIdx],
          dayLabel: dateObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
          isToday: ymd === today,
        }
      })
      return {
        ww,
        year: monday.getFullYear(),
        mondayYmd: toYmd(monday),
        fridayLabel: days[4].dayLabel,
        mondayLabel: days[0].dayLabel,
        days,
      }
    })
  }, [baseMonday, weeksToShow, viewMode, today])

  // Set of Mondays currently displayed in the workweek schedule (for highlighting in the mini calendar)
  const displayedMondays = useMemo(() => new Set(weeks.map((w) => w.mondayYmd)), [weeks])

  // Overdue basket: open tasks whose dueDate < today (sorted by Priority then dueDate)
  const overdueTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled' && !!t.dueDate && t.dueDate < today)
      .filter((t) => !filterProject || t.projectId === filterProject)
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || a.dueDate.localeCompare(b.dueDate))
  }, [tasks, today, filterProject])

  const overdueTaskIds = useMemo(() => new Set(overdueTasks.map((t) => t.id)), [overdueTasks])

  // Set of exact dates that have tasks or milestones (so we can bold them in the mini calendar like Outlook)
  const busyDates = useMemo(() => {
    const s = new Set<string>()
    for (const t of tasks) {
      if (t.status !== 'Cancelled' && t.dueDate && !overdueTaskIds.has(t.id) && (!filterProject || t.projectId === filterProject)) {
        s.add(t.dueDate)
      }
    }
    for (const m of milestones) if (m.targetDate && (!filterProject || m.projectId === filterProject)) s.add(m.targetDate)
    return s
  }, [tasks, milestones, overdueTaskIds, filterProject])

  // Build 2 stacked mini-months anchored on the Thursday of the first displayed workweek
  const miniMonths = useMemo(() => {
    const anchor = addDays(baseMonday, 3)
    const y1 = anchor.getFullYear()
    const m1 = anchor.getMonth()
    const next = new Date(y1, m1 + 1, 1)
    return [
      buildMiniMonthWeeks(y1, m1, { hideEndOverflow: true }),
      buildMiniMonthWeeks(next.getFullYear(), next.getMonth(), { hideStartOverflow: true }),
    ]
  }, [baseMonday])

  const projectCode = (pid: string) => projects.find((p) => p.id === pid)?.code ?? ''

  const itemsByDay = useMemo(() => {
    const map = new Map<string, { tasks: Task[]; milestones: Milestone[] }>()
    for (const t of tasks) {
      if (t.status === 'Cancelled' || !t.dueDate || overdueTaskIds.has(t.id)) continue
      if (filterProject && t.projectId !== filterProject) continue
      const key = snapToWorkdayYmd(t.dueDate)
      const bucket = map.get(key) ?? { tasks: [], milestones: [] }
      bucket.tasks.push(t)
      map.set(key, bucket)
    }
    for (const bucket of map.values()) {
      bucket.tasks.sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority])
    }
    for (const m of milestones) {
      if (!m.targetDate) continue
      if (filterProject && m.projectId !== filterProject) continue
      const key = snapToWorkdayYmd(m.targetDate)
      const bucket = map.get(key) ?? { tasks: [], milestones: [] }
      bucket.milestones.push(m)
      map.set(key, bucket)
    }
    return map
  }, [tasks, milestones, overdueTaskIds, filterProject])

  function toggleSelectItem(ref: CalendarItemRef, dayYmd?: string) {
    if (dayYmd) setSelectedDay(dayYmd)
    setSelectedItems((prev) =>
      prev.some((i) => i.id === ref.id) ? prev.filter((i) => i.id !== ref.id) : [...prev, ref],
    )
  }

  function handleItemClick(e: React.MouseEvent, ref: CalendarItemRef, dayYmd: string, openEdit: () => void) {
    e.stopPropagation()
    setSelectedDay(dayYmd)
    if (e.ctrlKey || e.metaKey) {
      toggleSelectItem(ref, dayYmd)
      return
    }
    setSelectedItems([ref])
    openEdit()
  }

  function handleCopyItems(items: CalendarItemRef[]) {
    if (items.length === 0) return
    setClipboard({ items, mode: 'copy' })
    showToast(items.length === 1 ? `Copied "${items[0].name}" — click Paste on any date` : `Copied ${items.length} items — click Paste on any date`)
  }

  function handleCutItems(items: CalendarItemRef[]) {
    if (items.length === 0) return
    setClipboard({ items, mode: 'cut' })
    showToast(items.length === 1 ? `Cut "${items[0].name}" — click Paste on any date to move` : `Cut ${items.length} items — click Paste on any date to move`)
  }

  function handleCopy(item: CalendarItemRef) {
    handleCopyItems(selectedIds.has(item.id) && selectedItems.length > 1 ? selectedItems : [item])
  }

  function handleCut(item: CalendarItemRef) {
    handleCutItems(selectedIds.has(item.id) && selectedItems.length > 1 ? selectedItems : [item])
  }

  async function handlePaste(targetYmd: string, ww?: number) {
    if (!clipboard || clipboard.items.length === 0) return
    const wwLabel = ww ? `WW${String(ww).padStart(2, '0')} (${targetYmd})` : targetYmd
    try {
      for (const item of clipboard.items) {
        if (clipboard.mode === 'cut') {
          if (item.kind === 'task') await rescheduleTask(item.id, targetYmd)
          else await rescheduleMilestone(item.id, targetYmd)
        } else {
          if (item.kind === 'task') await duplicateTaskToDate(item.id, targetYmd)
          else await duplicateMilestoneToDate(item.id, targetYmd)
        }
      }
      const n = clipboard.items.length
      if (clipboard.mode === 'cut') {
        showToast(n === 1 ? `Moved "${clipboard.items[0].name}" to ${wwLabel}` : `Moved ${n} items to ${wwLabel}`)
        setClipboard(null)
      } else {
        showToast(n === 1 ? `Pasted copy of "${clipboard.items[0].name}" to ${wwLabel}` : `Pasted ${n} items to ${wwLabel}`)
      }
    } catch {
      // ignore if deleted
    }
  }

  async function handleBulkPriorityBoxClick(priority: Priority) {
    const taskIds = selectedItems.filter((i) => i.kind === 'task').map((i) => i.id)
    if (taskIds.length === 0) {
      showToast('Select task(s) first, then click a priority color box to change priority')
      return
    }
    try {
      await updateTasksPriority(taskIds, priority)
      showToast(`Updated ${taskIds.length} task${taskIds.length > 1 ? 's' : ''} to ${priority} priority`)
    } catch {
      // ignore
    }
  }

  // Keyboard shortcuts: Ctrl+C, Ctrl+X on selected item(s); Ctrl+V on selected day
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'c' && selectedItems.length > 0) {
        e.preventDefault()
        handleCopyItems(selectedItems)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x' && selectedItems.length > 0) {
        e.preventDefault()
        handleCutItems(selectedItems)
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'v' && clipboard && selectedDay) {
        e.preventDefault()
        void handlePaste(selectedDay)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  })

  function onDragStart(e: React.DragEvent, payload: ItemRef) {
    e.dataTransfer.setData('application/json', JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(payload.id)
  }

  function onDragEnd() {
    setDraggingId('')
    setDragOverCell('')
  }

  async function onDropOnDay(e: React.DragEvent, targetYmd: string, ww: number) {
    e.preventDefault()
    setDragOverCell('')
    setDraggingId('')
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as ItemRef
      if (payload.kind === 'task') {
        await rescheduleTask(payload.id, targetYmd)
        showToast(`Task moved to WW${String(ww).padStart(2, '0')} (${targetYmd})`)
      } else if (payload.kind === 'milestone') {
        await rescheduleMilestone(payload.id, targetYmd)
        showToast(`Milestone moved to WW${String(ww).padStart(2, '0')} (${targetYmd})`)
      }
    } catch {
      // ignore invalid drag payload
    }
  }

  async function handleDropTaskAtTime(taskId: string, targetYmd: string, startTime: string, endTime: string, ww: number) {
    setDragOverCell('')
    setDraggingId('')
    try {
      await rescheduleTask(taskId, targetYmd, startTime, endTime)
      showToast(`Task moved to WW${String(ww).padStart(2, '0')} (${targetYmd} ${startTime}–${endTime})`)
    } catch {
      // ignore if deleted
    }
  }

  async function handleDropMilestone(milestoneId: string, targetYmd: string, ww: number) {
    setDragOverCell('')
    setDraggingId('')
    try {
      await rescheduleMilestone(milestoneId, targetYmd)
      showToast(`Milestone moved to WW${String(ww).padStart(2, '0')} (${targetYmd})`)
    } catch {
      // ignore if deleted
    }
  }

  const rangeLabel = `${weeks[0].mondayLabel} – ${weeks[weeks.length - 1].fridayLabel} ${weeks[weeks.length - 1].year}`

  return (
    <Card
      title="Workweek Schedule — Tasks & Milestones"
      className="xl:col-span-3 [&>header]:flex-col [&>header]:items-start [&>header]:gap-2.5"
      action={
        <div className="flex flex-wrap items-center gap-2 w-full">
          {toast && <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded">{toast}</span>}
          {selectedItems.length > 0 && (
            <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs text-emerald-900 font-medium">
              <span>{selectedItems.length} selected</span>
              <button onClick={() => handleCopyItems(selectedItems)} className="px-1.5 py-0.5 rounded bg-white border border-emerald-200 hover:bg-emerald-100 text-[11px]" title="Copy selected (Ctrl+C)">Copy</button>
              <button onClick={() => handleCutItems(selectedItems)} className="px-1.5 py-0.5 rounded bg-white border border-emerald-200 hover:bg-emerald-100 text-[11px]" title="Cut selected (Ctrl+X)">Cut</button>
              <button onClick={() => setSelectedItems([])} className="hover:text-slate-900" title="Clear selection"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          {clipboard && (
            <div className="inline-flex items-center gap-1.5 rounded border border-primary/30 bg-primary-soft px-2.5 py-1 text-xs text-primary font-medium">
              <span>
                {clipboard.mode === 'cut' ? 'Cut:' : 'Copied:'}{' '}
                {clipboard.items.length === 1 ? clipboard.items[0].name : `${clipboard.items.length} items`}
              </span>
              <button onClick={() => setClipboard(null)} className="hover:text-slate-800" title="Clear clipboard"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <select
            value={filterProject}
            onChange={(e) => setFilterProject(e.target.value)}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-primary/30"
          >
            <option value="">All projects</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.code} – {p.name}</option>
            ))}
          </select>

          {/* View mode switcher: Multi-Week vs Outlook-style 1-Week Hourly */}
          <div className="inline-flex rounded-lg border border-emerald-200 bg-emerald-50/70 p-0.5" role="group" aria-label="Calendar view mode">
            <button
              type="button"
              onClick={() => setViewMode('multi')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                viewMode === 'multi'
                  ? 'bg-primary text-white shadow-sm ring-1 ring-primary'
                  : 'text-slate-600 hover:bg-white/80 hover:text-emerald-900',
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Multi-Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={cn(
                'inline-flex items-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold transition-all',
                viewMode === 'week'
                  ? 'bg-primary text-white shadow-sm ring-1 ring-primary'
                  : 'text-slate-600 hover:bg-white/80 hover:text-emerald-900',
              )}
            >
              <Clock className="h-3.5 w-3.5" /> Weekly (Hours)
            </button>
          </div>

          {viewMode === 'multi' && (
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-md px-2 h-8">
              <span className="font-medium">Weeks:</span>
              <input
                type="number"
                min={4}
                max={10}
                value={Math.max(4, Math.min(10, weeksToShow))}
                onChange={(e) => setWeeksToShow(Math.max(4, Math.min(10, Number(e.target.value) || 4)))}
                className="w-11 bg-white border border-slate-200 rounded px-1.5 py-0.5 text-xs font-semibold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[11px] text-slate-500">(4–10)</span>
            </label>
          )}

          <div className="flex items-center gap-1">
            <Button
              size="sm"
              onClick={() => (viewMode === 'week' ? shiftWeek(-1) : shiftMonth(-1))}
              title={viewMode === 'week' ? 'Previous week' : 'Previous month'}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> {viewMode === 'week' ? 'Prev Week' : 'Prev Month'}
            </Button>
            <Button size="sm" onClick={goToCurrentWeek}>Current Week</Button>
            <Button
              size="sm"
              onClick={() => (viewMode === 'week' ? shiftWeek(1) : shiftMonth(1))}
              title={viewMode === 'week' ? 'Next week' : 'Next month'}
            >
              {viewMode === 'week' ? 'Next Week' : 'Next Month'} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
          <span className="text-xs text-slate-600 font-semibold min-w-[135px] text-right">{rangeLabel}</span>
        </div>
      }
    >
      {/* Interactive Priority Legend: click color box to set selected tasks' priority; click word to dim others */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
        <div className="flex flex-wrap items-center gap-3">
          {PRIORITY_LEGEND.map(({ priority, boxCls }) => {
            const active = priorityFilter === priority
            return (
              <span key={priority} className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all', active && 'bg-emerald-50 ring-1 ring-primary font-semibold')}>
                <button
                  type="button"
                  onClick={() => void handleBulkPriorityBoxClick(priority)}
                  title={`Click box to set selected task(s) to ${priority}`}
                  className={cn('h-3.5 w-3.5 rounded-sm border transition-transform hover:scale-110', boxCls)}
                />
                <button
                  type="button"
                  onClick={() => setPriorityFilter((f) => (f === priority ? null : priority))}
                  title={`Click word to dim non-${priority} tasks`}
                  className={cn('hover:text-primary', active ? 'text-primary font-bold underline' : '')}
                >
                  {priority}
                </button>
              </span>
            )
          })}
          <button
            type="button"
            onClick={() => setPriorityFilter((f) => (f === 'Completed' ? null : 'Completed'))}
            title="Click to dim non-completed tasks"
            className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 hover:text-primary', priorityFilter === 'Completed' && 'bg-emerald-50 ring-1 ring-primary font-bold text-primary')}
          >
            <span className="h-3.5 w-3.5 rounded-sm bg-emerald-500 border border-emerald-700" /> Completed
          </button>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-sm bg-purple-500 border border-purple-700" /> Milestone
          </span>
          {priorityFilter && (
            <button type="button" onClick={() => setPriorityFilter(null)} className="text-[11px] text-primary hover:underline font-medium">
              Show all
            </button>
          )}
        </div>
        <span className="text-slate-500">Click box to set priority · Click word to dim · Ctrl+Click or ☑ to multi-select</span>
      </div>

      {/* Split Layout: Left Outlook-style Mini Calendar + Right 5-Day Workweek Schedule */}
      <div className="flex flex-col lg:flex-row -mx-4 -mb-4 border-t border-slate-200">
        {/* LEFT: Outlook-style 2-Month Mini Calendar + Overdue Basket (height follows right calendar) */}
        <aside className="w-full lg:w-[235px] shrink-0 lg:relative bg-slate-50/70 text-slate-700 border-b lg:border-b-0 lg:border-r border-slate-200 select-none">
          <div className="p-3 flex flex-col lg:absolute lg:inset-0">
            <div className="shrink-0">
          {miniMonths.map((month, mIdx) => (
            <div key={month.title} className={cn(mIdx > 0 && 'mt-2.5 pt-2 border-t border-slate-200')}>
              <div className="flex items-center justify-between mb-1 px-1">
                {mIdx === 0 ? (
                  <button
                    onClick={() => shiftMonth(-1)}
                    className="p-0.5 rounded hover:bg-slate-200 text-slate-600"
                    title="Previous month"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                ) : <span className="w-5" />}
                <span className="text-[11px] font-bold tracking-wide text-slate-800">{month.title}</span>
                {mIdx === 0 ? (
                  <button
                    onClick={() => shiftMonth(1)}
                    className="p-0.5 rounded hover:bg-slate-200 text-slate-600"
                    title="Next month"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                ) : <span className="w-5" />}
              </div>

              {/* Column header: # | MO TU WE TH FR SA SU */}
              <div className="grid grid-cols-8 text-[10px] font-semibold text-slate-500 text-center pb-0.5 border-b border-slate-200">
                <span className="border-r border-slate-200">#</span>
                {MINI_DAYS.map((d) => <span key={d}>{d}</span>)}
              </div>

              {/* Week rows */}
              <div className="mt-0.5 space-y-0">
                {month.rows.map((row) => {
                  const isDisplayedWeek = displayedMondays.has(row.mondayYmd)
                  return (
                    <div
                      key={row.mondayYmd}
                      onClick={() => setBaseMonday(row.monday)}
                      title={`Click to start schedule at WW${String(row.ww).padStart(2, '0')} (${row.mondayYmd})`}
                      className="grid grid-cols-8 items-center text-center text-[11px] cursor-pointer group"
                    >
                      {/* Workweek number column */}
                      <span
                        className={cn(
                          'py-0.5 border-r border-slate-200 text-[10px] font-medium',
                          isDisplayedWeek ? 'bg-blue-100 text-blue-800 font-bold rounded-l border-y border-l border-blue-300' : 'text-slate-400 group-hover:text-slate-700',
                        )}
                      >
                        {row.ww}
                      </span>

                      {/* 7 days of the week; MO..FR highlighted when this workweek is displayed */}
                      {row.days.map((d, dIdx) => {
                        if (d.hidden) {
                          return <span key={d.ymd} className="py-0.5" />
                        }
                        const isToday = d.ymd === today
                        const inWorkweekHighlight = isDisplayedWeek && d.isWeekday
                        const hasItems = busyDates.has(d.ymd)
                        const isFirstHighlighted = inWorkweekHighlight && (dIdx === 0 || row.days[dIdx - 1]?.hidden)
                        const isLastHighlighted = inWorkweekHighlight && (dIdx === 4 || row.days[dIdx + 1]?.hidden)
                        return (
                          <span
                            key={d.ymd}
                            className={cn(
                              'py-0.5 transition-colors',
                              inWorkweekHighlight && 'bg-blue-100/75 border-y border-blue-300 text-slate-800 font-medium',
                              isFirstHighlighted && 'border-l border-blue-300',
                              isLastHighlighted && 'rounded-r border-r border-blue-300',
                              !inWorkweekHighlight && 'group-hover:bg-slate-200/70',
                              !d.inMonth && !inWorkweekHighlight && !isToday && 'text-slate-400',
                              d.inMonth && !inWorkweekHighlight && !isToday && 'text-slate-700',
                              hasItems && !isToday && 'font-bold text-slate-900',
                              isToday && '!bg-blue-600 !text-white font-semibold rounded dark:!bg-sky-400 dark:!text-slate-950 dark:font-bold dark:ring-1 dark:ring-sky-200',
                            )}
                          >
                            {d.dayNum}
                          </span>
                        )
                      })}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
            </div>

          {/* Overdue Basket (expands to match right calendar height, scrollable on overflow) */}
          <div className="mt-3 pt-2.5 border-t border-slate-200 flex flex-col lg:flex-1 lg:min-h-0">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700">
                <AlertCircle className="h-3.5 w-3.5" /> Overdue Basket ({overdueTasks.length})
              </span>
              <span className="text-[10px] text-slate-400">Drag to calendar</span>
            </div>
            {overdueTasks.length === 0 ? (
              <p className="text-[11px] text-slate-400 italic py-2">No overdue tasks.</p>
            ) : (
              <div className="space-y-1.5 overflow-y-auto pr-0.5 max-h-[200px] lg:max-h-none lg:flex-1 lg:min-h-0">
                {overdueTasks.map((t) => {
                  const ref: CalendarItemRef = { kind: 'task', id: t.id, name: t.name }
                  const isCut = clipboard?.mode === 'cut' && clipboard.items.some((i) => i.id === t.id)
                  const isSelected = selectedIds.has(t.id)
                  const isDimmed = !!priorityFilter && (priorityFilter === 'Completed' || t.priority !== priorityFilter)
                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, ref)}
                      onDragEnd={onDragEnd}
                      onClick={(e) => handleItemClick(e, ref, t.dueDate, () => onEditTask?.(t))}
                      title={`Overdue Task: ${t.name}\nDue: ${t.dueDate}\nPriority: ${t.priority}\nDrag onto calendar to reschedule · Click to edit`}
                      className={cn(
                        'group relative cursor-grab active:cursor-grabbing rounded border px-2 py-1.5 text-[11px] shadow-sm transition-all select-none',
                        taskCardStyle(t, today),
                        isSelected && 'ring-2 ring-primary',
                        isDimmed && !isSelected && 'opacity-25',
                        (draggingId === t.id || isCut) && 'opacity-45 border-dashed',
                      )}
                    >
                      <div className="flex items-start gap-1 min-w-0">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); toggleSelectItem(ref, t.dueDate) }}
                          title="Select / deselect"
                          className={cn(
                            'mt-0.5 h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center transition-opacity',
                            isSelected
                              ? 'bg-primary border-primary text-white opacity-100'
                              : 'border-slate-400/70 bg-white/80 opacity-0 group-hover:opacity-100',
                          )}
                        >
                          {isSelected && <Check className="h-2.5 w-2.5" />}
                        </button>
                        <div className="min-w-0 flex-1">
                          <p className="font-semibold truncate leading-tight">{t.name}</p>
                          <p className="text-[10px] opacity-80 truncate leading-tight mt-0.5">
                            {t.priority} · Due {t.dueDate}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          </div>
        </aside>

        {/* RIGHT: 5-Day Workweek Schedule (Multi-Week Grid OR Outlook 1-Week Hourly View) */}
        {viewMode === 'week' ? (
          <OutlookWeekHourlyView
            week={weeks[0]}
            itemsByDay={itemsByDay}
            today={today}
            projectCode={projectCode}
            selectedIds={selectedIds}
            selectedDay={selectedDay}
            draggingId={draggingId}
            clipboard={clipboard}
            priorityFilter={priorityFilter}
            onSelectDay={setSelectedDay}
            onItemClick={handleItemClick}
            onToggleSelect={toggleSelectItem}
            onEditTask={onEditTask}
            onEditMilestone={onEditMilestone}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onDropTaskAtTime={handleDropTaskAtTime}
            onDropMilestone={handleDropMilestone}
            taskCardStyle={taskCardStyle}
            milestoneCardStyle={milestoneCardStyle}
          />
        ) : (
        <div className="flex-1 overflow-x-auto">
          <div className="min-w-[820px]">
            {/* 5-day Workweek Header */}
            <div className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700">
              <div className="px-3 py-2 border-r border-slate-200">Workweek</div>
              {DAY_NAMES.map((day) => (
                <div key={day} className="px-3 py-2 border-r last:border-r-0 border-slate-200">{day}</div>
              ))}
            </div>

            {/* Workweek Rows */}
            {weeks.map((week) => (
              <div key={week.mondayYmd} className="grid grid-cols-[120px_repeat(5,minmax(0,1fr))] border-b last:border-b-0 border-slate-200">
                {/* Workweek Label Cell */}
                <div
                  onDragOver={(e) => { e.preventDefault(); setDragOverCell(`ww-${week.mondayYmd}`) }}
                  onDragLeave={() => setDragOverCell('')}
                  onDrop={(e) => onDropOnDay(e, week.mondayYmd, week.ww)}
                  className={cn(
                    'p-3 border-r border-slate-200 bg-slate-50 flex flex-col justify-between transition-colors',
                    dragOverCell === `ww-${week.mondayYmd}` && 'bg-primary-soft ring-2 ring-inset ring-primary',
                  )}
                >
                  <div>
                    <span className="inline-flex items-center rounded bg-slate-800 px-2 py-0.5 text-xs font-bold text-white">
                      WW{String(week.ww).padStart(2, '0')}
                    </span>
                    <p className="text-[11px] text-slate-600 font-medium mt-1">{week.mondayLabel} – {week.fridayLabel}</p>
                  </div>
                  {clipboard ? (
                    <button
                      onClick={() => handlePaste(week.mondayYmd, week.ww)}
                      className="mt-2 inline-flex items-center gap-1 rounded bg-primary px-2 py-1 text-[11px] font-medium text-white hover:bg-primary-hover"
                      title="Paste onto Monday of this workweek"
                    >
                      <ClipboardPaste className="h-3 w-3" /> Paste (Mon)
                    </button>
                  ) : (
                    <span className="text-[10px] text-slate-400 mt-2">Drop here → Mon</span>
                  )}
                </div>

                {/* 5 Days (Mon - Fri) */}
                {week.days.map((day) => {
                  const bucket = itemsByDay.get(day.ymd)
                  const dayTasks = bucket?.tasks ?? []
                  const dayMilestones = bucket?.milestones ?? []
                  const totalDayItems = dayMilestones.length + dayTasks.length
                  const isTwoColMatrix = totalDayItems > 4
                  const isScrollableDay = totalDayItems > 8
                  const isOver = dragOverCell === day.ymd
                  const isSelectedDay = selectedDay === day.ymd
                  return (
                    <div
                      key={day.ymd}
                      onClick={() => setSelectedDay(day.ymd)}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverCell !== day.ymd) setDragOverCell(day.ymd) }}
                      onDragLeave={() => setDragOverCell((c) => (c === day.ymd ? '' : c))}
                      onDrop={(e) => onDropOnDay(e, day.ymd, week.ww)}
                      className={cn(
                        'min-h-[130px] p-2 border-r last:border-r-0 border-slate-200 flex flex-col gap-1.5 transition-colors min-w-0',
                        day.isToday ? 'bg-blue-50/50' : 'bg-white',
                        isSelectedDay && 'ring-1 ring-inset ring-slate-400',
                        isOver && 'bg-primary-soft ring-2 ring-inset ring-primary',
                      )}
                    >
                      <div className="flex items-center justify-between text-xs mb-0.5 border-b border-slate-100 pb-1 shrink-0">
                        <span className={cn('font-medium', day.isToday ? 'text-primary font-bold' : 'text-slate-600')}>
                          {day.dayLabel}
                          {totalDayItems > 0 && (
                            <span className="ml-1 text-[10px] font-normal text-slate-400">({totalDayItems})</span>
                          )}
                        </span>
                        <div className="flex items-center gap-1">
                          {day.isToday && <Badge color="blue">Today</Badge>}
                          {clipboard && (
                            <button
                              onClick={(e) => { e.stopPropagation(); void handlePaste(day.ymd, week.ww) }}
                              className="inline-flex items-center gap-0.5 rounded bg-primary/10 hover:bg-primary text-primary hover:text-white px-1.5 py-0.5 text-[11px] font-medium transition-colors"
                              title={`Paste ${clipboard.items.length} item(s) onto ${day.dayLabel}`}
                            >
                              <ClipboardPaste className="h-3 w-3" /> Paste
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Items container: >4 items splits into a 2x4 matrix; >8 items caps height at 4 rows and scrolls */}
                      <div
                        className={cn(
                          isTwoColMatrix ? 'grid grid-cols-2 gap-1.5 auto-rows-min' : 'flex flex-col gap-1.5',
                          isScrollableDay && 'max-h-[224px] overflow-y-auto pr-0.5',
                        )}
                      >
                        {/* Milestones on this day */}
                        {dayMilestones.map((m) => {
                          const ref: CalendarItemRef = { kind: 'milestone', id: m.id, name: m.name }
                          const isCut = clipboard?.mode === 'cut' && clipboard.items.some((i) => i.id === m.id)
                          const isSelected = selectedIds.has(m.id)
                          const isDimmed = !!priorityFilter
                          return (
                            <div
                              key={m.id}
                              draggable
                              onDragStart={(e) => onDragStart(e, ref)}
                              onDragEnd={onDragEnd}
                              onClick={(e) => handleItemClick(e, ref, day.ymd, () => onEditMilestone?.(m))}
                              title={`Milestone: ${m.name}\nProject: ${projectCode(m.projectId)}\nTarget: ${m.targetDate} (${m.status})\nClick to edit · Ctrl+Click to multi-select`}
                              className={cn(
                                'group relative cursor-grab active:cursor-grabbing rounded border shadow-sm transition-all select-none min-w-0',
                                isTwoColMatrix ? 'px-1.5 py-1 text-[11px]' : 'px-2 py-1.5 text-xs',
                                milestoneCardStyle(m, today),
                                isSelected && 'ring-2 ring-primary',
                                isDimmed && !isSelected && 'opacity-25',
                                (draggingId === m.id || isCut) && 'opacity-45 border-dashed',
                              )}
                            >
                              <div className="flex items-start gap-1 min-w-0">
                                {!isTwoColMatrix && <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-90 mt-0.5" />}
                                <Flag className="h-3 w-3 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold truncate leading-tight">{m.name}</p>
                                  <p className="text-[10px] opacity-80 truncate leading-tight mt-0.5">{projectCode(m.projectId)} · Milestone</p>
                                </div>
                                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 bg-white/90 rounded px-1 py-0.5 shadow-sm" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => handleCopy(ref)} title="Copy milestone" className="p-0.5 hover:text-primary"><Copy className="h-3 w-3" /></button>
                                  <button onClick={() => handleCut(ref)} title="Cut milestone to move" className="p-0.5 hover:text-primary"><Scissors className="h-3 w-3" /></button>
                                </div>
                              </div>
                            </div>
                          )
                        })}

                        {/* Tasks on this day */}
                        {dayTasks.map((t) => {
                          const ref: CalendarItemRef = { kind: 'task', id: t.id, name: t.name }
                          const isCut = clipboard?.mode === 'cut' && clipboard.items.some((i) => i.id === t.id)
                          const isSelected = selectedIds.has(t.id)
                          const isDimmed = !!priorityFilter && (priorityFilter === 'Completed' ? t.status !== 'Completed' : t.status === 'Completed' || t.priority !== priorityFilter)
                          return (
                            <div
                              key={t.id}
                              draggable
                              onDragStart={(e) => onDragStart(e, ref)}
                              onDragEnd={onDragEnd}
                              onClick={(e) => handleItemClick(e, ref, day.ymd, () => onEditTask?.(t))}
                              title={`Task: ${t.name}\nProject: ${projectCode(t.projectId)}\nPriority: ${t.priority}\nStatus: ${t.status}\nDue: ${t.dueDate}\nClick to edit · Ctrl+Click or ☑ to multi-select`}
                              className={cn(
                                'group relative cursor-grab active:cursor-grabbing rounded border shadow-sm transition-all select-none min-w-0',
                                isTwoColMatrix ? 'px-1.5 py-1 text-[11px]' : 'px-2 py-1.5 text-xs',
                                taskCardStyle(t, today),
                                isSelected && 'ring-2 ring-primary',
                                isDimmed && !isSelected && 'opacity-25',
                                (draggingId === t.id || isCut) && 'opacity-45 border-dashed',
                              )}
                            >
                              <div className="flex items-start gap-1 min-w-0">
                                <button
                                  type="button"
                                  onClick={(e) => { e.stopPropagation(); toggleSelectItem(ref, day.ymd) }}
                                  title="Select / deselect for multi-action"
                                  className={cn(
                                    'mt-0.5 h-3.5 w-3.5 shrink-0 rounded border flex items-center justify-center transition-opacity',
                                    isSelected
                                      ? 'bg-primary border-primary text-white opacity-100'
                                      : 'border-slate-400/70 bg-white/80 opacity-0 group-hover:opacity-100',
                                  )}
                                >
                                  {isSelected && <Check className="h-2.5 w-2.5" />}
                                </button>
                                {!isTwoColMatrix && <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-90 mt-0.5" />}
                                <CheckSquare className="h-3 w-3 shrink-0 mt-0.5" />
                                <div className="min-w-0 flex-1">
                                  <p className="font-semibold truncate leading-tight">{t.name}</p>
                                  <p className="text-[10px] opacity-80 truncate leading-tight mt-0.5">{projectCode(t.projectId)} · {t.priority}</p>
                                </div>
                                <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 bg-white/90 rounded px-1 py-0.5 shadow-sm" onClick={(e) => e.stopPropagation()}>
                                  <button onClick={() => handleCopy(ref)} title="Copy task" className="p-0.5 hover:text-primary"><Copy className="h-3 w-3" /></button>
                                  <button onClick={() => handleCut(ref)} title="Cut task to move" className="p-0.5 hover:text-primary"><Scissors className="h-3 w-3" /></button>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
        )}
      </div>
    </Card>
  )
}

