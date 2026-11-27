import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, CalendarDays, CheckSquare, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ClipboardPaste, Clock, Copy, Flag, GripVertical, Info, Plus, Scissors, Sun, X } from 'lucide-react'
import type { Milestone, Priority, Project, Task, Workstream } from '@/types'
import { Badge, Button, Card, SearchableSelect } from '@/components/ui'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import { createTask, duplicateTaskToDate, emptyTask, rescheduleTask, updateTasksPriority, updateTasksStatus } from '@/services/taskService'
import { duplicateMilestoneToDate, rescheduleMilestone } from '@/services/milestoneService'
import { cn, todayStr } from '@/utils/helpers'
import { parseOutlookMsg, type MsgAttachment } from '@/utils/msgParser'
import { addAttachmentsToTask, uploadAttachment } from '@/services/attachmentService'
import type { TaskAttachment } from '@/types'
import { OutlookWeekHourlyView, type CalendarClipboard, type CalendarItemRef } from './OutlookWeekHourlyView'

function toMins(hhmm?: string): number {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return 8 * 60
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function fromMins(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

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
  { priority: 'High', boxCls: 'bg-orange-500 border-orange-700' },
  { priority: 'Medium', boxCls: 'bg-yellow-400 border-yellow-600' },
  { priority: 'Low', boxCls: 'bg-slate-400 border-slate-600' },
]

// Task colour is driven by Priority (High = orange, Medium = yellow, Completed = emerald green).
// Task colour is driven by Priority (High = orange, Medium = yellow, Completed = emerald green).
// Non-actionable tasks (FYI) maintain their priority/completed color, just dimmer.
function taskCardStyle(t: Task, _today: string): string {
  const dim = t.actionable === false ? ' opacity-50 saturate-75' : ''
  if (t.status === 'Completed') {
    return `border-emerald-400 border-l-4 border-l-emerald-600 bg-emerald-100/90 text-emerald-950${dim}`
  }
  switch (t.priority) {
    case 'Critical':
      return `border-rose-400 border-l-4 border-l-rose-600 bg-rose-100/90 text-rose-950${dim}`
    case 'High':
      return `border-orange-400 border-l-4 border-l-orange-600 bg-orange-100/90 text-orange-950${dim}`
    case 'Medium':
      return `border-yellow-400 border-l-4 border-l-yellow-500 bg-yellow-100/90 text-yellow-950${dim}`
    case 'Low':
    default:
      return `border-slate-300 border-l-4 border-l-slate-500 bg-slate-100 text-slate-900${dim}`
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
  workstreams: externalWorkstreams,
  isEditOpen = false,
  isEditTaskOpen = false,
  baseMonday: controlledMonday,
  onBaseMondayChange,
  onAddTask,
  onEditTask,
  onEditMilestone,
}: {
  tasks: Task[]
  milestones: Milestone[]
  projects: Project[]
  workstreams?: Workstream[]
  isEditOpen?: boolean
  isEditTaskOpen?: boolean
  baseMonday?: Date
  onBaseMondayChange?: (d: Date) => void
  onAddTask?: (dueDate: string) => void
  onEditTask?: (t: Task) => void
  onEditMilestone?: (m: Milestone) => void
}) {
  const tableWorkstreams = useTable<Workstream>('workstreams') ?? []
  const workstreams = externalWorkstreams ?? tableWorkstreams
  const today = todayStr()
  // Start at current week's Monday by default; Prev/Next jumps by 1 month
  const [internalMonday, setInternalMonday] = useState<Date>(() => getMondayOfWeek(parseYmd(today)))
  const baseMonday = controlledMonday ?? internalMonday
  const setBaseMonday = (updater: Date | ((prev: Date) => Date)) => {
    const next = typeof updater === 'function' ? updater(baseMonday) : updater
    setInternalMonday(next)
    onBaseMondayChange?.(next)
  }
  // View mode: 'multi' (4-10 weeks grid), 'week' (1-week Mon-Fri hourly), or 'day' (1-day hourly)
  const [viewMode, setViewMode] = usePersistedState<'multi' | 'week' | 'day'>('npi.calendar.viewMode', 'multi')
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
  const [miniCalOpen, setMiniCalOpen] = usePersistedState<boolean>('npi.calendar.miniCalOpen', true)
  const [tempMiniCalExpanded, setTempMiniCalExpanded] = useState(false)
  const [miniCalDragOverYmd, setMiniCalDragOverYmd] = useState('')
  const miniCalHoverTimerRef = useRef<number | null>(null)
  const effectiveMiniCalOpen = miniCalOpen || tempMiniCalExpanded
  const [wrapTaskName, setWrapTaskName] = usePersistedState<boolean>('npi.calendar.wrapTaskName', false)
  const [asideWidth, setAsideWidth] = usePersistedState<number>('npi.calendar.asideWidth', 235)
  const [todayBasketHeight, setTodayBasketHeight] = usePersistedState<number>('npi.calendar.todayBasketHeight', 160)
  const [todayBasketDragOver, setTodayBasketDragOver] = useState(false)
  const splitContainerRef = useRef<HTMLDivElement>(null)

  function startTodayBasketResize(e: React.MouseEvent) {
    e.preventDefault()
    const startY = e.clientY
    const startH = todayBasketHeight
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(60, Math.min(520, startH + (ev.clientY - startY)))
      setTodayBasketHeight(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

  function startAsideResize(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startW = asideWidth
    const maxW = splitContainerRef.current ? Math.max(480, splitContainerRef.current.clientWidth - 260) : 1100
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(180, Math.min(maxW, startW + (ev.clientX - startX)))
      setAsideWidth(next)
    }
    const onUp = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }

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
    if (viewMode === 'day') setSelectedDay(today)
  }

  function shiftDay(deltaDays: number) {
    const cur = parseYmd(selectedDay || today)
    let next = addDays(cur, deltaDays)
    if (next.getDay() === 6) next = addDays(next, deltaDays > 0 ? 2 : -1)
    if (next.getDay() === 0) next = addDays(next, deltaDays > 0 ? 1 : -2)
    const nextYmd = toYmd(next)
    setSelectedDay(nextYmd)
    setBaseMonday(getMondayOfWeek(next))
  }

  const weeks = useMemo(() => {
    const count = viewMode === 'multi' ? Math.max(4, Math.min(10, weeksToShow)) : 1
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

  // Today basket: open tasks due today with no hour assigned (startTime empty)
  const todayBasketTasks = useMemo(() => {
    return tasks
      .filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled' && t.dueDate === today && !t.startTime)
      .filter((t) => !filterProject || t.projectId === filterProject)
      .sort((a, b) => PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority] || (a.createdAt || '').localeCompare(b.createdAt || ''))
  }, [tasks, today, filterProject])

  const todayBasketTaskIds = useMemo(() => new Set(todayBasketTasks.map((t) => t.id)), [todayBasketTasks])

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
  const projectName = (pid: string) => {
    const p = projects.find((x) => x.id === pid)
    if (!p) return ''
    return p.packageType && !p.isNonNpi ? `${p.name} (${p.packageType})` : p.name || p.code
  }
  const workstreamLabel = (wid: string): string => {
    if (!wid) return ''
    const w = workstreams.find((x) => x.id === wid)
    if (!w) return ''
    return w.name && w.name !== w.category ? `${w.category}: ${w.name}` : w.category
  }
  const projectNickname = (pid: string) => {
    const p = projects.find((x) => x.id === pid)
    if (!p) return ''
    return p.nickname || p.name || p.code || ''
  }
  const taskSubLabel = (t: Task) => {
    const nick = projectNickname(t.projectId)
    const stage = workstreamLabel(t.workstreamId)
    if (nick && stage) return `${nick} · ${stage}`
    if (nick) return nick
    if (stage) return stage
    return projectCode(t.projectId)
  }

  const itemsByDay = useMemo(() => {
    const map = new Map<string, { tasks: Task[]; milestones: Milestone[] }>()
    for (const t of tasks) {
      if (t.status === 'Cancelled' || !t.dueDate || overdueTaskIds.has(t.id)) continue
      if ((viewMode === 'week' || viewMode === 'day') && todayBasketTaskIds.has(t.id)) continue
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
  }, [tasks, milestones, overdueTaskIds, todayBasketTaskIds, viewMode, filterProject])

  function toggleSelectItem(ref: CalendarItemRef, dayYmd?: string) {
    if (dayYmd) setSelectedDay(dayYmd)
    setSelectedItems((prev) =>
      prev.some((i) => i.id === ref.id) ? prev.filter((i) => i.id !== ref.id) : [...prev, ref],
    )
  }

  function handleItemClick(e: React.MouseEvent, ref: CalendarItemRef, dayYmd: string, openEdit?: () => void) {
    e.stopPropagation()
    if (dayYmd) setSelectedDay(dayYmd)
    if (e.ctrlKey || e.metaKey) {
      toggleSelectItem(ref, dayYmd)
      return
    }
    setSelectedItems([ref])
    if ((isEditOpen || isEditTaskOpen) && openEdit) {
      openEdit()
    }
  }

  function handleItemDoubleClick(e: React.MouseEvent, ref: CalendarItemRef, dayYmd: string, openEdit: () => void) {
    e.stopPropagation()
    if (dayYmd) setSelectedDay(dayYmd)
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
      let lastCopiedTask: Task | undefined
      for (const item of clipboard.items) {
        if (clipboard.mode === 'cut') {
          if (item.kind === 'task') await rescheduleTask(item.id, targetYmd)
          else await rescheduleMilestone(item.id, targetYmd)
        } else {
          if (item.kind === 'task') lastCopiedTask = await duplicateTaskToDate(item.id, targetYmd)
          else await duplicateMilestoneToDate(item.id, targetYmd)
        }
      }
      const n = clipboard.items.length
      if (clipboard.mode === 'cut') {
        showToast(n === 1 ? `Moved "${clipboard.items[0].name}" to ${wwLabel}` : `Moved ${n} items to ${wwLabel}`)
        setClipboard(null)
      } else {
        showToast(n === 1 ? `Pasted copy of "${clipboard.items[0].name}" to ${wwLabel}` : `Pasted ${n} items to ${wwLabel}`)
        if (lastCopiedTask) {
          setSelectedItems([{ kind: 'task', id: lastCopiedTask.id, name: lastCopiedTask.name }])
          onEditTask?.(lastCopiedTask)
        }
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

  async function handleBulkCompleteBoxClick() {
    const taskIds = selectedItems.filter((i) => i.kind === 'task').map((i) => i.id)
    if (taskIds.length === 0) {
      showToast('Select task(s) first, then click the green Completed box to mark completed')
      return
    }
    try {
      await updateTasksStatus(taskIds, 'Completed')
      showToast(`Marked ${taskIds.length} task${taskIds.length > 1 ? 's' : ''} as Completed`)
    } catch {
      // ignore
    }
  }

  // Keyboard shortcuts: Ctrl+1/2/` switch view mode; Esc unselects; Ctrl+C/X/V copy/cut/paste
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.altKey && !e.shiftKey) {
        if (e.key === '1') {
          e.preventDefault()
          setViewMode('multi')
          return
        }
        if (e.key === '2') {
          e.preventDefault()
          setViewMode('week')
          return
        }
        if (e.key === '`' || e.code === 'Backquote') {
          e.preventDefault()
          setViewMode('day')
          if (!selectedDay) setSelectedDay(today)
          return
        }
      }
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.key === 'Escape') {
        setSelectedDay('')
        setSelectedItems([])
        return
      }
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

  // Clicking empty space outside calendar day cells/items unselects the active date & selection
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-calendar-day]') || target.closest('[data-calendar-item]') || target.closest('[data-keep-selection]') || target.closest('aside')) return
      if (viewMode !== 'day') setSelectedDay('')
      setSelectedItems([])
    }
    document.addEventListener('mousedown', onDocMouseDown)
    return () => document.removeEventListener('mousedown', onDocMouseDown)
  }, [viewMode])

  function onDragStart(e: React.DragEvent, payload: ItemRef) {
    e.dataTransfer.setData('application/json', JSON.stringify(payload))
    e.dataTransfer.effectAllowed = 'move'
    setDraggingId(payload.id)
  }

  function clearMiniCalHoverTimer() {
    if (miniCalHoverTimerRef.current !== null) {
      window.clearTimeout(miniCalHoverTimerRef.current)
      miniCalHoverTimerRef.current = null
    }
  }

  function onDragEnd() {
    clearMiniCalHoverTimer()
    setMiniCalDragOverYmd('')
    setTempMiniCalExpanded(false)
    setDraggingId('')
    setDragOverCell('')
  }

  async function createTaskFromDroppedEmail(
    dt: DataTransfer,
    targetYmd: string,
    startTime = '',
    endTime = '',
  ): Promise<boolean> {
    let subject = ''
    let rawBody = ''
    let emailSender = ''
    let emailDate = ''
    let embeddedAttachments: MsgAttachment[] = []

    // Read synchronous DataTransfer values before any await
    const files = Array.from(dt.files || [])
    const plain = dt.getData('text/plain')?.trim() || ''
    const html = !plain ? dt.getData('text/html')?.trim() || '' : ''

    const emailFile = files.find((f) => /\.(msg|eml)$/i.test(f.name)) || files[0]
    if (emailFile) {
      subject = emailFile.name.replace(/\.(msg|eml)$/i, '').replace(/_+/g, ' ').trim()
      if (/\.msg$/i.test(emailFile.name)) {
        try {
          const buf = await emailFile.arrayBuffer()
          const parsed = parseOutlookMsg(buf)
          if (parsed.subject) subject = parsed.subject
          if (parsed.body) rawBody = parsed.body
          if (parsed.sender) emailSender = parsed.sender
          if (parsed.date) emailDate = parsed.date
          embeddedAttachments = parsed.attachments
        } catch {
          // fallback to filename
        }
      } else if (/\.eml$/i.test(emailFile.name)) {
        try {
          const rawEml = await emailFile.text()
          const subjMatch = rawEml.match(/^Subject:\s*(.+)$/im)
          if (subjMatch?.[1]) subject = subjMatch[1].trim()
          const fromMatch = rawEml.match(/^From:\s*(.+)$/im)
          if (fromMatch?.[1]) emailSender = fromMatch[1].trim()
          const dateMatch = rawEml.match(/^Date:\s*(.+)$/im)
          if (dateMatch?.[1]) emailDate = dateMatch[1].trim()
          const splitIdx = rawEml.search(/\r?\n\r?\n/)
          if (splitIdx !== -1) {
            rawBody = rawEml.slice(splitIdx).trim()
          }
        } catch {
          // fallback to filename
        }
      }
    }

    const textContent = plain || html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()

    if (textContent.includes('\t')) {
      const parts = textContent.split('\n')[0].split('\t').map((s) => s.trim()).filter(Boolean)
      if (!emailSender && parts[0]) emailSender = parts[0]
      if (!subject) subject = parts.length >= 2 ? parts[1] : parts[0] || ''
      if (!emailDate && parts[2]) emailDate = parts[2]
    } else if (!subject && textContent) {
      subject = textContent.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || ''
    }
    if (subject.length > 140) subject = `${subject.slice(0, 137)}...`

    // Only fall back to textContent for body if it isn't just a tab-separated Outlook header row
    if (!rawBody && textContent && !textContent.includes('\t')) {
      rawBody = textContent
    }

    // Trim email body at standard sign-off / confidentiality / reply-chain markers and cap at 120 words
    let bodySummary = ''
    if (rawBody) {
      let cleaned = rawBody
      const stopRe = /(?:^|\n|\s)(?:best regards|kind regards|warm regards|thanks\s*(?:&|and)\s*regards|regards|sincerely|cheers|nxp confidential|-----original message-----|from:\s+[^\n]+sent:|________________________________)/i
      const match = cleaned.match(stopRe)
      if (match && match.index !== undefined) {
        cleaned = cleaned.slice(0, match.index)
      }
      cleaned = cleaned.replace(/\s+/g, ' ').trim()
      const words = cleaned.split(/\s+/).filter(Boolean)
      const MAX_WORDS = 120
      bodySummary = words.length > MAX_WORDS ? `${words.slice(0, MAX_WORDS).join(' ')}…` : cleaned
    }

    const headerLines = [
      emailSender ? `From: ${emailSender}` : '',
      emailDate ? `Date: ${emailDate}` : '',
    ].filter(Boolean)
    const remarks = [headerLines.join('\n'), bodySummary].filter(Boolean).join('\n\n')

    if (!subject) return false

    const emailProj =
      projects.find((p) => [p.nickname, p.name, p.code].some((v) => (v || '').trim().toLowerCase() === 'email')) ||
      projects[0]

    if (!emailProj) {
      showToast('Create an "Email" product first to drop emails as tasks')
      return true
    }

    const created = await createTask({
      ...emptyTask(emailProj.id),
      name: subject,
      dueDate: targetYmd,
      startTime,
      endTime,
      remarks,
    })
    const projLabel = emailProj.nickname || emailProj.name || emailProj.code
    showToast(`Added email task "${created.name}" to ${projLabel} (${targetYmd})`)

    // Auto-attach the dropped email itself (.msg/.eml) + its embedded file attachments
    if (emailFile) {
      try {
        const atts: TaskAttachment[] = [await uploadAttachment(emailFile, emailFile.name, 'email')]
        for (const a of embeddedAttachments) {
          const blob = new Blob([a.data.slice()], { type: a.mime || 'application/octet-stream' })
          atts.push(await uploadAttachment(blob, a.name, 'email'))
        }
        await addAttachmentsToTask(created.id, atts)
        const extra = atts.length - 1
        showToast(`Added "${created.name}" to ${projLabel} with email${extra > 0 ? ` + ${extra} attachment${extra > 1 ? 's' : ''}` : ''} attached`)
      } catch {
        showToast(`Task added, but attaching the email failed — is the local server running?`)
      }
    }
    return true
  }

  async function onDropOnDay(e: React.DragEvent, targetYmd: string, ww: number) {
    e.preventDefault()
    setDragOverCell('')
    setDraggingId('')
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) {
      await createTaskFromDroppedEmail(e.dataTransfer, targetYmd)
      return
    }
    try {
      const payload = JSON.parse(raw) as ItemRef
      if (payload.kind === 'task') {
        // Feature 4: if dragged from overdue basket, default to 08:00–09:00
        const isOverdue = overdueTaskIds.has(payload.id)
        if (isOverdue) {
          await rescheduleTask(payload.id, targetYmd, '08:00', '09:00')
          showToast(`Task moved to WW${String(ww).padStart(2, '0')} (${targetYmd}) — defaulted to 08:00`)
        } else {
          await rescheduleTask(payload.id, targetYmd)
          showToast(`Task moved to WW${String(ww).padStart(2, '0')} (${targetYmd})`)
        }
      } else if (payload.kind === 'milestone') {
        await rescheduleMilestone(payload.id, targetYmd)
        showToast(`Milestone moved to WW${String(ww).padStart(2, '0')} (${targetYmd})`)
      }
    } catch {
      // ignore invalid drag payload
    }
  }

  async function handleDropOnMiniCalDate(e: React.DragEvent, targetYmd: string) {
    e.preventDefault()
    e.stopPropagation()
    clearMiniCalHoverTimer()
    setMiniCalDragOverYmd('')
    setTempMiniCalExpanded(false)
    setDraggingId('')
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) {
      await createTaskFromDroppedEmail(e.dataTransfer, targetYmd)
      return
    }
    try {
      const payload = JSON.parse(raw) as ItemRef
      if (payload.kind === 'task') {
        await rescheduleTask(payload.id, targetYmd, '', '')
        showToast(`Moved "${payload.name}" to ${targetYmd} (no hour)`)
      } else if (payload.kind === 'milestone') {
        await rescheduleMilestone(payload.id, targetYmd)
        showToast(`Moved milestone "${payload.name}" to ${targetYmd}`)
      }
    } catch {
      // ignore invalid drag payload
    }
  }

  async function handleDropOnTodayBasket(e: React.DragEvent) {
    e.preventDefault()
    setTodayBasketDragOver(false)
    setDraggingId('')
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) {
      await createTaskFromDroppedEmail(e.dataTransfer, today)
      return
    }
    try {
      const payload = JSON.parse(raw) as ItemRef
      if (payload.kind === 'task') {
        await rescheduleTask(payload.id, today, '', '')
        showToast(`Moved "${payload.name}" to Today Basket`)
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

  async function handleResizeTaskTime(taskId: string, ymd: string, startTime: string, endTime: string) {
    try {
      await rescheduleTask(taskId, ymd, startTime, endTime)
      showToast(`Updated task time: ${startTime}–${endTime}`)
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
    <>
      {toast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 rounded-full border border-slate-200 bg-white/95 backdrop-blur-md px-4 py-1.5 text-xs font-semibold text-primary shadow-lg pointer-events-none">
          {toast}
        </div>
      )}
    <Card
      title="Workweek Schedule — Tasks & Milestones"
      className="xl:col-span-3 [&>header]:flex-col [&>header]:items-start [&>header]:gap-2.5"
      action={
        <div className="flex flex-wrap items-center gap-2 w-full">
          <div className="inline-flex items-center gap-1" data-keep-selection="1">
            {(() => {
              const sortedProjectOptions = [...projects]
                .map((p) => ({ value: p.id, label: p.nickname || p.name || p.code }))
                .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }))
              const cycleIds = ['', ...sortedProjectOptions.map((o) => o.value)]
              const stepProject = (delta: number) => {
                const idx = cycleIds.indexOf(filterProject)
                const cur = idx === -1 ? 0 : idx
                const next = (cur + delta + cycleIds.length) % cycleIds.length
                setFilterProject(cycleIds[next])
              }
              return (
                <>
                  <SearchableSelect
                    pill
                    value={filterProject}
                    onChange={(val) => setFilterProject(val)}
                    emptyLabel="All products"
                    className="min-w-[160px]"
                    options={sortedProjectOptions}
                  />
                  <button
                    type="button"
                    onClick={() => stepProject(-1)}
                    title="Previous product"
                    className="h-8 w-7 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => stepProject(1)}
                    title="Next product"
                    className="h-8 w-7 inline-flex items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )
            })()}
          </div>

          {/* View mode switcher: Multi-Week, Weekly (Hours), 1 Day */}
          <div className="inline-flex rounded-full border border-slate-200 bg-slate-100 p-0.5" role="group" aria-label="Calendar view mode">
            <button
              type="button"
              onClick={() => setViewMode('multi')}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all',
                viewMode === 'multi'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900',
              )}
            >
              <CalendarDays className="h-3.5 w-3.5" /> Multi-Week
            </button>
            <button
              type="button"
              onClick={() => setViewMode('week')}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all',
                viewMode === 'week'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900',
              )}
            >
              <Clock className="h-3.5 w-3.5" /> Weekly (Hours)
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode('day')
                if (!selectedDay) setSelectedDay(today)
              }}
              className={cn(
                'inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold transition-all',
                viewMode === 'day'
                  ? 'bg-primary text-white shadow-sm'
                  : 'text-slate-600 hover:bg-white/80 hover:text-slate-900',
              )}
            >
              <Sun className="h-3.5 w-3.5" /> 1 Day
            </button>
          </div>

          {viewMode === 'multi' && (
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 border border-slate-200 rounded-full px-3 h-8">
              <span className="font-medium">Weeks:</span>
              <input
                type="number"
                min={4}
                max={10}
                value={Math.max(4, Math.min(10, weeksToShow))}
                onChange={(e) => setWeeksToShow(Math.max(4, Math.min(10, Number(e.target.value) || 4)))}
                className="w-10 bg-white border border-slate-200 rounded-full px-1.5 py-0.5 text-xs font-semibold text-slate-800 text-center focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-[11px] text-slate-500">(4–10)</span>
            </label>
          )}

          {/* Feature 5: Wrap task name toggle (tick/untick) in ribbon */}
          <label
            title={wrapTaskName ? 'Task names wrap to show full text — untick to truncate' : 'Task names truncated — tick to wrap full name'}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 h-8 text-xs font-semibold cursor-pointer select-none transition-all',
              wrapTaskName
                ? 'bg-primary text-white border-primary shadow-sm'
                : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-white/80 hover:text-slate-900',
            )}
          >
            <input
              type="checkbox"
              checked={wrapTaskName}
              onChange={(e) => setWrapTaskName(e.target.checked)}
              className="h-3.5 w-3.5 rounded accent-white cursor-pointer"
            />
            Wrap Text
          </label>

          <div className="flex items-center gap-1" data-keep-selection="1">
            <Button
              size="sm"
              onClick={() => (viewMode === 'day' ? shiftDay(-1) : viewMode === 'week' ? shiftWeek(-1) : shiftMonth(-1))}
              title={viewMode === 'day' ? 'Previous day' : viewMode === 'week' ? 'Previous week' : 'Previous month'}
            >
              <ChevronLeft className="h-3.5 w-3.5" /> {viewMode === 'day' ? 'Prev Day' : viewMode === 'week' ? 'Prev Week' : 'Prev Month'}
            </Button>
            <Button size="sm" onClick={goToCurrentWeek}>{viewMode === 'day' ? 'Today' : 'Current Week'}</Button>
            <Button
              size="sm"
              onClick={() => (viewMode === 'day' ? shiftDay(1) : viewMode === 'week' ? shiftWeek(1) : shiftMonth(1))}
              title={viewMode === 'day' ? 'Next day' : viewMode === 'week' ? 'Next week' : 'Next month'}
            >
              {viewMode === 'day' ? 'Next Day' : viewMode === 'week' ? 'Next Week' : 'Next Month'} <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>

          {onAddTask && (
            <Button
              size="sm"
              variant="primary"
              data-keep-selection="1"
              onClick={() => onAddTask(selectedDay || today)}
              title={selectedDay ? `Add task on ${selectedDay}` : `Add task on ${today}`}
            >
              <Plus className="h-3.5 w-3.5" /> Add Task{selectedDay ? ` (${selectedDay})` : ''}
            </Button>
          )}
          <span className="text-xs text-slate-600 font-semibold min-w-[135px] text-right">{rangeLabel}</span>
        </div>
      }
    >
      {/* Interactive Priority & Completed Legend: click color box to update selected tasks; click word to dim others */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600" data-keep-selection="1">
        <div className="flex flex-wrap items-center gap-3">
          {PRIORITY_LEGEND.map(({ priority, boxCls }) => {
            const active = priorityFilter === priority
            return (
              <span key={priority} className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all', active && 'bg-primary-soft ring-1 ring-primary font-semibold')}>
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
          <span className={cn('inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-all', priorityFilter === 'Completed' && 'bg-primary-soft ring-1 ring-primary font-semibold')}>
            <button
              type="button"
              onClick={() => void handleBulkCompleteBoxClick()}
              title="Click green box to mark selected task(s) as Completed"
              className="h-3.5 w-3.5 rounded-sm bg-emerald-500 border border-emerald-700 transition-transform hover:scale-110"
            />
            <button
              type="button"
              onClick={() => setPriorityFilter((f) => (f === 'Completed' ? null : 'Completed'))}
              title="Click word to dim non-completed tasks"
              className={cn('hover:text-primary', priorityFilter === 'Completed' ? 'text-primary font-bold underline' : '')}
            >
              Completed
            </button>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-3.5 w-3.5 rounded-sm bg-purple-500 border border-purple-700" /> Milestone
          </span>
          {priorityFilter && (
            <button type="button" onClick={() => setPriorityFilter(null)} className="text-[11px] text-primary hover:underline font-medium">
              Show all
            </button>
          )}
        </div>
        <span className="text-slate-500">Click box to update selected · Click word to dim · Esc or empty space to unselect</span>
      </div>

      {/* Split Layout: Left Outlook-style Mini Calendar + Right 5-Day Workweek Schedule */}
      <div ref={splitContainerRef} className="flex flex-col lg:flex-row -mx-4 -mb-4 border-t border-slate-200">
        {/* LEFT: Outlook-style 2-Month Mini Calendar + Overdue Basket (height follows right calendar, width resizable) */}
        <aside
          style={{ ['--aside-w' as string]: `${asideWidth}px` }}
          className="w-full lg:w-[var(--aside-w)] shrink-0 lg:relative bg-slate-50/70 text-slate-700 border-b lg:border-b-0 lg:border-r border-slate-200 select-none"
        >
          <div
            onMouseDown={startAsideResize}
            title="Drag to resize column width"
            className="hidden lg:block absolute top-0 right-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 z-20 transition-colors"
          />
          <div className="p-3 flex flex-col lg:absolute lg:inset-0">
            <div
              className="shrink-0"
              onDragEnter={() => {
                if (!miniCalOpen && !tempMiniCalExpanded && miniCalHoverTimerRef.current === null) {
                  miniCalHoverTimerRef.current = window.setTimeout(() => {
                    setTempMiniCalExpanded(true)
                    miniCalHoverTimerRef.current = null
                  }, 700)
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
                  clearMiniCalHoverTimer()
                  setMiniCalDragOverYmd('')
                  setTempMiniCalExpanded(false)
                }
              }}
            >
              <button
                type="button"
                onClick={() => {
                  clearMiniCalHoverTimer()
                  setTempMiniCalExpanded(false)
                  setMiniCalOpen((v) => !v)
                }}
                className="w-full flex items-center justify-between px-1.5 py-1 mb-1 rounded-lg hover:bg-slate-200/70 text-[11px] font-semibold text-slate-600 transition-colors"
                title={effectiveMiniCalOpen ? 'Hide mini calendar' : 'Show mini calendar (or hover a dragged task for 0.7s)'}
              >
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" />
                  Mini Calendar
                </span>
                {effectiveMiniCalOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
              {effectiveMiniCalOpen && miniMonths.map((month, mIdx) => (
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
                {MINI_DAYS.map((d, idx) => (
                  <span key={d} className={idx >= 5 ? 'text-slate-300' : ''}>{d}</span>
                ))}
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
                        const isActiveDay = viewMode === 'day' && d.ymd === (selectedDay || today)
                        const isDragTarget = miniCalDragOverYmd === d.ymd
                        const inWorkweekHighlight = isDisplayedWeek && d.isWeekday
                        const hasItems = busyDates.has(d.ymd)
                        const isFirstHighlighted = inWorkweekHighlight && (dIdx === 0 || row.days[dIdx - 1]?.hidden)
                        const isLastHighlighted = inWorkweekHighlight && (dIdx === 4 || row.days[dIdx + 1]?.hidden)
                        return (
                          <span
                            key={d.ymd}
                            onClick={(e) => {
                              if (viewMode === 'day') {
                                e.stopPropagation()
                                setSelectedDay(d.ymd)
                                setBaseMonday(row.monday)
                              }
                            }}
                            onDragOver={(e) => {
                              e.preventDefault()
                              e.stopPropagation()
                              e.dataTransfer.dropEffect = draggingId ? 'move' : 'copy'
                              if (miniCalDragOverYmd !== d.ymd) setMiniCalDragOverYmd(d.ymd)
                            }}
                            onDragLeave={(e) => {
                              e.stopPropagation()
                              if (miniCalDragOverYmd === d.ymd) setMiniCalDragOverYmd('')
                            }}
                            onDrop={(e) => void handleDropOnMiniCalDate(e, d.ymd)}
                            title={viewMode === 'day' ? `Go to ${d.ymd} (or drop task here)` : `Drop task to move to ${d.ymd} (no hour)`}
                            className={cn(
                              'py-0.5 transition-colors',
                              inWorkweekHighlight && 'bg-blue-100/75 border-y border-blue-300 text-slate-800 font-medium',
                              isFirstHighlighted && 'border-l border-blue-300',
                              isLastHighlighted && 'rounded-r border-r border-blue-300',
                              !inWorkweekHighlight && 'hover:bg-slate-200/80',
                              !d.isWeekday && !isToday && !isActiveDay && '!text-slate-300 bg-slate-100/60 font-normal',
                              d.isWeekday && !d.inMonth && !inWorkweekHighlight && !isToday && 'text-slate-400',
                              d.isWeekday && d.inMonth && !inWorkweekHighlight && !isToday && 'text-slate-700',
                              d.isWeekday && hasItems && !isToday && 'font-bold text-slate-900',
                              isActiveDay && !isToday && '!bg-primary/15 !text-primary ring-1 ring-primary rounded font-bold',
                              isToday && '!bg-blue-600 !text-white font-semibold rounded dark:!bg-sky-400 dark:!text-slate-950 dark:font-bold dark:ring-1 dark:ring-sky-200',
                              isDragTarget && '!bg-primary !text-white rounded ring-2 ring-primary/50 font-bold',
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

          {/* Today Basket (unscheduled today tasks; drag in from hourly or out to hourly/other days) */}
          <div
            onDragOver={(e) => {
              e.preventDefault()
              e.dataTransfer.dropEffect = draggingId ? 'move' : 'copy'
              setTodayBasketDragOver(true)
            }}
            onDragLeave={() => setTodayBasketDragOver(false)}
            onDrop={handleDropOnTodayBasket}
            className={cn(
              'pt-2.5 border-t border-slate-200 flex flex-col shrink-0 rounded-lg transition-colors',
              effectiveMiniCalOpen ? 'mt-3' : 'mt-1.5',
              todayBasketDragOver && 'bg-blue-50/80 ring-1 ring-primary',
            )}
          >
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-blue-700">
                <Sun className="h-3.5 w-3.5" /> Today Basket ({todayBasketTasks.length})
              </span>
              <span className="text-[10px] text-slate-400">No hour</span>
            </div>
            {todayBasketTasks.length === 0 ? (
              <p style={{ minHeight: `${Math.min(todayBasketHeight, 80)}px` }} className="text-[11px] text-slate-400 italic py-1.5">
                Drag tasks or emails here, or add today&apos;s tasks without an hour.
              </p>
            ) : (
              <div style={{ height: `${todayBasketHeight}px` }} className="space-y-1.5 overflow-y-auto pr-0.5">
                {todayBasketTasks.map((t) => {
                  const ref: CalendarItemRef = { kind: 'task', id: t.id, name: t.name }
                  const isCut = clipboard?.mode === 'cut' && clipboard.items.some((i) => i.id === t.id)
                  const isSelected = selectedIds.has(t.id)
                  const isDimmed = !!priorityFilter && (priorityFilter === 'Completed' || t.priority !== priorityFilter)
                  const isNonActionable = t.actionable === false
                  const wsLabel = workstreamLabel(t.workstreamId)
                  return (
                    <div
                      key={t.id}
                      data-calendar-item="1"
                      draggable
                      onDragStart={(e) => onDragStart(e, ref)}
                      onDragEnd={onDragEnd}
                      onClick={(e) => handleItemClick(e, ref, '', () => onEditTask?.(t))}
                      onDoubleClick={(e) => handleItemDoubleClick(e, ref, '', () => onEditTask?.(t))}
                      title={`Today Task (unscheduled): ${t.name}\nPriority: ${t.priority}${wsLabel ? `\nStage: ${wsLabel}` : ''}\n${isNonActionable ? '📋 FYI only (not actionable)\n' : ''}Drag onto an hour slot or another day`}
                      className={cn(
                        'group relative cursor-grab active:cursor-grabbing rounded-xl border px-2.5 py-1.5 text-[11px] shadow-sm transition-all select-none',
                        taskCardStyle(t, today),
                        isSelected && 'ring-2 ring-primary',
                        isDimmed && !isSelected && 'opacity-25',
                        (draggingId === t.id || isCut) && 'opacity-45 border-dashed',
                      )}
                    >
                      <div className="flex items-start gap-1 min-w-0">
                        <div className="min-w-0 flex-1">
                          <p className={cn('font-semibold leading-tight', wrapTaskName ? 'break-words' : 'truncate', isNonActionable && 'italic')}>{t.name}</p>
                          <p className={cn('text-[11px] font-medium leading-tight mt-0.5', wrapTaskName ? 'break-words' : 'truncate')}>
                            {taskSubLabel(t)}{isNonActionable ? ' (FYI)' : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* Movable divider between Today Basket and Overdue Basket */}
          <div
            onMouseDown={startTodayBasketResize}
            title="Drag up/down to adjust Today Basket vs Overdue Basket height"
            className="h-2.5 my-1 flex items-center justify-center cursor-row-resize group shrink-0"
          >
            <div className="w-full border-t border-slate-200 group-hover:border-primary/60 group-hover:border-t-2 transition-colors" />
          </div>

          {/* Overdue Basket (expands to match right calendar height, scrollable on overflow) */}
          <div className="flex flex-col lg:flex-1 lg:min-h-0">
            <div className="flex items-center justify-between mb-1.5 shrink-0">
              <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700">
                <AlertCircle className="h-3.5 w-3.5" /> Overdue Basket ({overdueTasks.length})
              </span>
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
                  const isNonActionable = t.actionable === false
                  const wsLabel = workstreamLabel(t.workstreamId)
                  return (
                    <div
                      key={t.id}
                      data-calendar-item="1"
                      draggable
                      onDragStart={(e) => onDragStart(e, ref)}
                      onDragEnd={onDragEnd}
                      onClick={(e) => handleItemClick(e, ref, '', () => onEditTask?.(t))}
                      onDoubleClick={(e) => handleItemDoubleClick(e, ref, '', () => onEditTask?.(t))}
                      title={`Overdue Task: ${t.name}\nDue: ${t.dueDate}\nPriority: ${t.priority}${wsLabel ? `\nStage: ${wsLabel}` : ''}\n${isNonActionable ? '📋 FYI only (not actionable)\n' : ''}Click to select · Double-click to edit · Drag onto calendar to reschedule`}
                      className={cn(
                        'group relative cursor-grab active:cursor-grabbing rounded-xl border px-2.5 py-1.5 text-[11px] shadow-sm transition-all select-none',
                        taskCardStyle(t, today),
                        isSelected && 'ring-2 ring-primary',
                        isDimmed && !isSelected && 'opacity-25',
                        (draggingId === t.id || isCut) && 'opacity-45 border-dashed',
                      )}
                    >
                      <div className="flex items-start gap-1 min-w-0">
                        <div className="min-w-0 flex-1">
                          <p className={cn('font-semibold leading-tight', wrapTaskName ? 'break-words' : 'truncate', isNonActionable && 'italic')}>{t.name}</p>
                          <p className={cn('text-[11px] font-medium leading-tight mt-0.5', wrapTaskName ? 'break-words' : 'truncate')}>
                            {taskSubLabel(t)}{isNonActionable ? ' (FYI)' : ''}
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

        {/* RIGHT: 5-Day Workweek Schedule (Multi-Week Grid, Weekly Hourly, or 1-Day Hourly) */}
        {viewMode === 'week' || viewMode === 'day' ? (
          <OutlookWeekHourlyView
            week={weeks[0]}
            singleDay={
              viewMode === 'day'
                ? (() => {
                    const targetYmd = selectedDay || today
                    const dObj = parseYmd(targetYmd)
                    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
                    return {
                      ymd: targetYmd,
                      dayName: dayNames[dObj.getDay()],
                      dayLabel: dObj.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }),
                      isToday: targetYmd === today,
                    }
                  })()
                : undefined
            }
            itemsByDay={itemsByDay}
            today={today}
            projectCode={projectCode}
            projectName={projectName}
            workstreamLabel={workstreamLabel}
            projectNickname={projectNickname}
            taskSubLabel={taskSubLabel}
            wrapTaskName={wrapTaskName}
            selectedIds={selectedIds}
            selectedDay={selectedDay}
            draggingId={draggingId}
            clipboard={clipboard}
            priorityFilter={priorityFilter}
            onSelectDay={setSelectedDay}
            onItemClick={handleItemClick}
            onItemDoubleClick={handleItemDoubleClick}
            onEditTask={onEditTask}
            onEditMilestone={onEditMilestone}
            onDragStart={onDragStart}
            onDragEnd={onDragEnd}
            onCopy={handleCopy}
            onCut={handleCut}
            onPaste={handlePaste}
            onDropTaskAtTime={handleDropTaskAtTime}
            onResizeTaskTime={handleResizeTaskTime}
            onDropMilestone={handleDropMilestone}
            onDropExternalEmail={(dt, ymd, st, et) => void createTaskFromDroppedEmail(dt, ymd, st, et)}
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
                  onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = draggingId ? 'move' : 'copy'; setDragOverCell(`ww-${week.mondayYmd}`) }}
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
                      data-calendar-day="1"
                      onClick={() => setSelectedDay(day.ymd)}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = draggingId ? 'move' : 'copy'; if (dragOverCell !== day.ymd) setDragOverCell(day.ymd) }}
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
                        <div className="flex items-center gap-1" data-keep-selection="1">
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
                              data-calendar-item="1"
                              draggable
                              onDragStart={(e) => onDragStart(e, ref)}
                              onDragEnd={onDragEnd}
                              onClick={(e) => handleItemClick(e, ref, day.ymd, () => onEditMilestone?.(m))}
                              onDoubleClick={(e) => handleItemDoubleClick(e, ref, day.ymd, () => onEditMilestone?.(m))}
                              title={`Milestone: ${m.name}\nProject: ${projectCode(m.projectId)}\nTarget: ${m.targetDate} (${m.status})\nClick to select · Double-click to edit · Ctrl+Click to multi-select`}
                              className={cn(
                                'group relative cursor-grab active:cursor-grabbing rounded-xl border shadow-sm transition-all select-none min-w-0',
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
                          const isNonActionable = t.actionable === false
                          const wsLabel = workstreamLabel(t.workstreamId)
                          return (
                            <div
                              key={t.id}
                              data-calendar-item="1"
                              draggable
                              onDragStart={(e) => onDragStart(e, ref)}
                              onDragEnd={onDragEnd}
                              onClick={(e) => handleItemClick(e, ref, day.ymd, () => onEditTask?.(t))}
                              onDoubleClick={(e) => handleItemDoubleClick(e, ref, day.ymd, () => onEditTask?.(t))}
                              title={`Task: ${t.name}\nProject: ${projectCode(t.projectId)}${wsLabel ? `\nStage: ${wsLabel}` : ''}\nPriority: ${t.priority}\nStatus: ${t.status}\nDue: ${t.dueDate}\n${isNonActionable ? '📋 FYI only (not actionable)\n' : ''}Click to select · Double-click to edit · Ctrl+Click or ☑ to multi-select`}
                              className={cn(
                                'group relative cursor-grab active:cursor-grabbing rounded-xl border shadow-sm transition-all select-none min-w-0',
                                isTwoColMatrix ? 'px-1.5 py-1 text-[11px]' : 'px-2 py-1.5 text-xs',
                                taskCardStyle(t, today),
                                isSelected && 'ring-2 ring-primary',
                                isDimmed && !isSelected && 'opacity-25',
                                (draggingId === t.id || isCut) && 'opacity-45 border-dashed',
                              )}
                            >
                              <div className="flex items-start gap-1 min-w-0">
                                {!isTwoColMatrix && <GripVertical className="h-3.5 w-3.5 shrink-0 opacity-50 group-hover:opacity-90 mt-0.5" />}
                                <div className="min-w-0 flex-1">
                                  <p className={cn('font-semibold leading-tight', wrapTaskName ? 'break-words' : 'truncate', isNonActionable && 'italic')}>{t.name}</p>
                                  <p className={cn('text-[11px] font-medium leading-tight mt-0.5', wrapTaskName ? 'break-words' : 'truncate')}>
                                    {taskSubLabel(t)}{isNonActionable ? ' (FYI)' : ''}
                                  </p>
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
    </>
  )
}

