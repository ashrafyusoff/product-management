import { useMemo, useState } from 'react'
import { CheckSquare, ClipboardPaste, Copy, Flag, Scissors } from 'lucide-react'
import type { Milestone, Task } from '@/types'
import { Badge } from '@/components/ui'
import { cn } from '@/utils/helpers'

export interface CalendarItemRef {
  kind: 'task' | 'milestone'
  id: string
  name: string
}

export interface CalendarClipboardItem extends CalendarItemRef {
  mode: 'copy' | 'cut'
}

export interface WorkweekDay {
  ymd: string
  dayName: string
  dayLabel: string
  isToday: boolean
}

export interface WorkweekData {
  ww: number
  year: number
  mondayYmd: string
  fridayLabel: string
  mondayLabel: string
  days: WorkweekDay[]
}

const HOUR_HEIGHT = 56 // px per hour
const DEFAULT_START_HOUR = 8
const DEFAULT_END_HOUR = 18

const FALLBACK_SLOTS: readonly [string, string][] = [
  ['09:00', '10:00'],
  ['10:00', '11:30'],
  ['11:30', '12:30'],
  ['13:30', '15:00'],
  ['15:00', '16:30'],
  ['16:30', '17:30'],
]

function parseTimeToMinutes(hhmm?: string): number | null {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return null
  const [h, m] = hhmm.split(':').map(Number)
  if (Number.isNaN(h) || Number.isNaN(m)) return null
  return h * 60 + m
}

export function minutesToHhmm(totalMin: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(totalMin)))
  const h = Math.floor(clamped / 60)
  const m = clamped % 60
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

export function resolveTaskTimeRange(t: Task): { startMin: number; endMin: number; startLabel: string; endLabel: string } {
  const parsedStart = parseTimeToMinutes(t.startTime)
  const parsedEnd = parseTimeToMinutes(t.endTime)
  if (parsedStart !== null && parsedEnd !== null && parsedEnd > parsedStart) {
    return { startMin: parsedStart, endMin: parsedEnd, startLabel: t.startTime!, endLabel: t.endTime! }
  }
  if (parsedStart !== null) {
    const endMin = Math.min(23 * 60 + 45, parsedStart + 60)
    return { startMin: parsedStart, endMin, startLabel: t.startTime!, endLabel: minutesToHhmm(endMin) }
  }
  // Deterministic fallback for legacy tasks created without explicit hours
  let hash = 0
  for (let i = 0; i < t.id.length; i++) hash = (hash * 31 + t.id.charCodeAt(i)) >>> 0
  const [s, e] = FALLBACK_SLOTS[hash % FALLBACK_SLOTS.length]
  return {
    startMin: parseTimeToMinutes(s)!,
    endMin: parseTimeToMinutes(e)!,
    startLabel: s,
    endLabel: e,
  }
}

interface PositionedTask {
  task: Task
  startMin: number
  endMin: number
  startLabel: string
  endLabel: string
  col: number
  totalCols: number
}

/** Assigns side-by-side columns for overlapping tasks on the same day (Outlook-style). */
function layoutDayTasks(dayTasks: Task[]): PositionedTask[] {
  const items = dayTasks
    .map((task) => ({ task, ...resolveTaskTimeRange(task) }))
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin)

  const positioned: PositionedTask[] = []
  let cluster: typeof items = []
  let clusterEnd = -1

  const flushCluster = () => {
    if (cluster.length === 0) return
    const colEnds: number[] = []
    const assigned: { item: (typeof items)[number]; col: number }[] = []
    for (const item of cluster) {
      let col = colEnds.findIndex((end) => end <= item.startMin)
      if (col === -1) {
        col = colEnds.length
        colEnds.push(item.endMin)
      } else {
        colEnds[col] = item.endMin
      }
      assigned.push({ item, col })
    }
    const totalCols = Math.max(1, colEnds.length)
    for (const { item, col } of assigned) {
      positioned.push({ ...item, col, totalCols })
    }
    cluster = []
    clusterEnd = -1
  }

  for (const item of items) {
    if (cluster.length === 0 || item.startMin < clusterEnd) {
      cluster.push(item)
      clusterEnd = Math.max(clusterEnd, item.endMin)
    } else {
      flushCluster()
      cluster.push(item)
      clusterEnd = item.endMin
    }
  }
  flushCluster()
  return positioned
}

export function OutlookWeekHourlyView({
  week,
  itemsByDay,
  today,
  projectCode,
  selectedItem,
  selectedDay,
  draggingId,
  clipboard,
  onSelectDay,
  onSelectItem,
  onEditTask,
  onEditMilestone,
  onDragStart,
  onDragEnd,
  onCopy,
  onCut,
  onPaste,
  onDropTaskAtTime,
  onDropMilestone,
  taskCardStyle,
  milestoneCardStyle,
}: {
  week: WorkweekData
  itemsByDay: Map<string, { tasks: Task[]; milestones: Milestone[] }>
  today: string
  projectCode: (pid: string) => string
  selectedItem: CalendarItemRef | null
  selectedDay: string
  draggingId: string
  clipboard: CalendarClipboardItem | null
  onSelectDay: (ymd: string) => void
  onSelectItem: (ref: CalendarItemRef) => void
  onEditTask?: (t: Task) => void
  onEditMilestone?: (m: Milestone) => void
  onDragStart: (e: React.DragEvent, ref: CalendarItemRef) => void
  onDragEnd: () => void
  onCopy: (ref: CalendarItemRef) => void
  onCut: (ref: CalendarItemRef) => void
  onPaste: (ymd: string, ww: number) => void
  onDropTaskAtTime: (taskId: string, ymd: string, startTime: string, endTime: string, ww: number) => void
  onDropMilestone: (milestoneId: string, ymd: string, ww: number) => void
  taskCardStyle: (t: Task, today: string) => string
  milestoneCardStyle: (m: Milestone, today: string) => string
}) {
  const [hoverSlot, setHoverSlot] = useState<{ ymd: string; topPx: number } | null>(null)

  const { startHour, endHour, hours, dayLayouts, hasAnyMilestones } = useMemo(() => {
    let minH = DEFAULT_START_HOUR
    let maxH = DEFAULT_END_HOUR
    let anyMs = false
    const layouts = new Map<string, PositionedTask[]>()

    for (const day of week.days) {
      const bucket = itemsByDay.get(day.ymd)
      const dayTasks = bucket?.tasks ?? []
      const dayMilestones = bucket?.milestones ?? []
      if (dayMilestones.length > 0) anyMs = true
      const laidOut = layoutDayTasks(dayTasks)
      layouts.set(day.ymd, laidOut)
      for (const item of laidOut) {
        minH = Math.min(minH, Math.floor(item.startMin / 60))
        maxH = Math.max(maxH, Math.ceil(item.endMin / 60))
      }
    }

    minH = Math.max(0, minH)
    maxH = Math.min(24, Math.max(minH + 1, maxH))
    const hrs = Array.from({ length: maxH - minH }, (_, i) => minH + i)
    return { startHour: minH, endHour: maxH, hours: hrs, dayLayouts: layouts, hasAnyMilestones: anyMs }
  }, [week.days, itemsByDay])

  const gridStartMin = startHour * 60
  const totalGridHeight = hours.length * HOUR_HEIGHT

  // Current time indicator (shown on today's column if within visible hours)
  const now = new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  const showNowLine = nowMin >= startHour * 60 && nowMin <= endHour * 60
  const nowTopPx = ((nowMin - gridStartMin) / 60) * HOUR_HEIGHT

  function getDropMinutes(e: React.DragEvent<HTMLDivElement>): number {
    const rect = e.currentTarget.getBoundingClientRect()
    const offsetY = Math.max(0, Math.min(totalGridHeight - 30, e.clientY - rect.top))
    const snappedHalfHours = Math.floor(offsetY / (HOUR_HEIGHT / 2))
    return gridStartMin + snappedHalfHours * 30
  }

  function handleColumnDragOver(e: React.DragEvent<HTMLDivElement>, ymd: string) {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    const dropMin = getDropMinutes(e)
    const topPx = ((dropMin - gridStartMin) / 60) * HOUR_HEIGHT
    if (!hoverSlot || hoverSlot.ymd !== ymd || hoverSlot.topPx !== topPx) {
      setHoverSlot({ ymd, topPx })
    }
  }

  function handleColumnDrop(e: React.DragEvent<HTMLDivElement>, ymd: string) {
    e.preventDefault()
    const dropMin = getDropMinutes(e)
    setHoverSlot(null)
    const raw = e.dataTransfer.getData('application/json')
    if (!raw) return
    try {
      const payload = JSON.parse(raw) as CalendarItemRef
      if (payload.kind === 'task') {
        // Find original task duration (default 60m)
        let duration = 60
        for (const list of dayLayouts.values()) {
          const found = list.find((p) => p.task.id === payload.id)
          if (found) {
            duration = Math.max(30, found.endMin - found.startMin)
            break
          }
        }
        const startTime = minutesToHhmm(dropMin)
        const endTime = minutesToHhmm(Math.min(23 * 60 + 55, dropMin + duration))
        onDropTaskAtTime(payload.id, ymd, startTime, endTime, week.ww)
      } else if (payload.kind === 'milestone') {
        onDropMilestone(payload.id, ymd, week.ww)
      }
    } catch {
      // ignore invalid drag payload
    }
  }

  return (
    <div className="flex-1 overflow-x-auto">
      <div className="min-w-[820px]">
        {/* Day Headers (5 full columns Mon - Fri) */}
        <div className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] bg-slate-100 border-b border-slate-200 text-xs font-semibold text-slate-700 sticky top-0 z-10">
          <div className="px-2 py-2.5 border-r border-slate-200 flex items-center justify-center">
            <span className="inline-flex items-center rounded bg-slate-800 px-1.5 py-0.5 text-[11px] font-bold text-white">
              WW{String(week.ww).padStart(2, '0')}
            </span>
          </div>
          {week.days.map((day) => {
            const count = (itemsByDay.get(day.ymd)?.tasks.length ?? 0) + (itemsByDay.get(day.ymd)?.milestones.length ?? 0)
            return (
              <div
                key={day.ymd}
                onClick={() => onSelectDay(day.ymd)}
                className={cn(
                  'px-3 py-2 border-r last:border-r-0 border-slate-200 flex items-center justify-between cursor-pointer',
                  day.isToday && 'bg-blue-50 text-primary',
                  selectedDay === day.ymd && 'ring-1 ring-inset ring-slate-400',
                )}
              >
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="font-bold">{day.dayName}</span>
                  <span className="text-[11px] font-normal text-slate-500">{day.dayLabel}</span>
                  {count > 0 && <span className="text-[10px] font-normal text-slate-400">({count})</span>}
                </div>
                <div className="flex items-center gap-1">
                  {day.isToday && <Badge color="blue">Today</Badge>}
                  {clipboard && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onPaste(day.ymd, week.ww) }}
                      className="inline-flex items-center gap-0.5 rounded bg-primary/10 hover:bg-primary text-primary hover:text-white px-1.5 py-0.5 text-[10px] font-medium transition-colors"
                      title={`Paste "${clipboard.name}" onto ${day.dayLabel}`}
                    >
                      <ClipboardPaste className="h-3 w-3" /> Paste
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* All-Day / Milestones Strip (just like Outlook's All-Day header) */}
        {hasAnyMilestones && (
          <div className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] border-b border-slate-200 bg-slate-50/70">
            <div className="px-2 py-2 border-r border-slate-200 text-[10px] font-semibold text-slate-500 flex items-center justify-center text-center">
              Milestones
            </div>
            {week.days.map((day) => {
              const dayMilestones = itemsByDay.get(day.ymd)?.milestones ?? []
              return (
                <div key={day.ymd} className="p-1.5 border-r last:border-r-0 border-slate-200 flex flex-col gap-1 min-w-0">
                  {dayMilestones.map((m) => {
                    const ref: CalendarItemRef = { kind: 'milestone', id: m.id, name: m.name }
                    const isCut = clipboard?.mode === 'cut' && clipboard.id === m.id
                    const isSelected = selectedItem?.id === m.id
                    return (
                      <div
                        key={m.id}
                        draggable
                        onDragStart={(e) => onDragStart(e, ref)}
                        onDragEnd={onDragEnd}
                        onClick={(e) => { e.stopPropagation(); onSelectItem(ref); onSelectDay(day.ymd) }}
                        onDoubleClick={(e) => { e.stopPropagation(); onSelectItem(ref); onSelectDay(day.ymd); onEditMilestone?.(m) }}
                        title={`Milestone: ${m.name}\nProject: ${projectCode(m.projectId)}\nTarget: ${m.targetDate} (${m.status})\nClick to select · Double-click to edit`}
                        className={cn(
                          'group relative cursor-grab active:cursor-grabbing rounded border px-1.5 py-1 text-[11px] shadow-sm select-none min-w-0',
                          milestoneCardStyle(m, today),
                          isSelected && 'ring-2 ring-primary',
                          (draggingId === m.id || isCut) && 'opacity-45 border-dashed',
                        )}
                      >
                        <div className="flex items-center gap-1 min-w-0">
                          <Flag className="h-3 w-3 shrink-0" />
                          <span className="font-semibold truncate flex-1">{m.name}</span>
                          <span className="text-[10px] opacity-75 shrink-0">{projectCode(m.projectId)}</span>
                          <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 bg-white/90 rounded px-0.5" onClick={(e) => e.stopPropagation()}>
                            <button onClick={() => onCopy(ref)} title="Copy milestone" className="p-0.5 hover:text-primary"><Copy className="h-3 w-3" /></button>
                            <button onClick={() => onCut(ref)} title="Cut milestone" className="p-0.5 hover:text-primary"><Scissors className="h-3 w-3" /></button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })}
          </div>
        )}

        {/* Hourly Time Grid */}
        <div className="grid grid-cols-[64px_repeat(5,minmax(0,1fr))] relative">
          {/* Left Time Axis */}
          <div className="border-r border-slate-200 bg-slate-50/60 select-none">
            {hours.map((h) => (
              <div
                key={h}
                style={{ height: HOUR_HEIGHT }}
                className="border-b border-slate-200 pr-2 pt-1 text-right text-[11px] font-medium text-slate-500"
              >
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* 5 Day Columns (Mon - Fri) */}
          {week.days.map((day) => {
            const laidOut = dayLayouts.get(day.ymd) ?? []
            return (
              <div
                key={day.ymd}
                style={{ height: totalGridHeight }}
                onClick={() => onSelectDay(day.ymd)}
                onDragOver={(e) => handleColumnDragOver(e, day.ymd)}
                onDragLeave={() => setHoverSlot((s) => (s?.ymd === day.ymd ? null : s))}
                onDrop={(e) => handleColumnDrop(e, day.ymd)}
                className={cn(
                  'relative border-r last:border-r-0 border-slate-200 min-w-0',
                  day.isToday ? 'bg-blue-50/25' : 'bg-white',
                )}
              >
                {/* Hour & Half-Hour Grid Lines */}
                {hours.map((h) => (
                  <div key={h} style={{ height: HOUR_HEIGHT }} className="border-b border-slate-200 relative pointer-events-none">
                    <div className="absolute inset-x-0 top-1/2 border-b border-dashed border-slate-100" />
                  </div>
                ))}

                {/* Drag-over 30-min slot preview */}
                {hoverSlot?.ymd === day.ymd && (
                  <div
                    style={{ top: hoverSlot.topPx, height: HOUR_HEIGHT / 2 }}
                    className="absolute inset-x-1 rounded border-2 border-dashed border-primary bg-primary/10 pointer-events-none z-10"
                  />
                )}

                {/* Current time red indicator line on Today */}
                {day.isToday && showNowLine && (
                  <div style={{ top: nowTopPx }} className="absolute inset-x-0 z-20 pointer-events-none flex items-center">
                    <span className="h-2 w-2 -ml-1 rounded-full bg-red-500 shrink-0" />
                    <div className="h-[2px] flex-1 bg-red-500" />
                  </div>
                )}

                {/* Positioned Task Blocks */}
                {laidOut.map((item) => {
                  const { task: t, startMin, endMin, startLabel, endLabel, col, totalCols } = item
                  const topPx = ((startMin - gridStartMin) / 60) * HOUR_HEIGHT + 1
                  const heightPx = Math.max(24, ((endMin - startMin) / 60) * HOUR_HEIGHT - 2)
                  const widthPct = 100 / totalCols
                  const leftPct = col * widthPct
                  const ref: CalendarItemRef = { kind: 'task', id: t.id, name: t.name }
                  const isCut = clipboard?.mode === 'cut' && clipboard.id === t.id
                  const isSelected = selectedItem?.id === t.id
                  const isCompact = heightPx < 42

                  return (
                    <div
                      key={t.id}
                      draggable
                      onDragStart={(e) => onDragStart(e, ref)}
                      onDragEnd={onDragEnd}
                      onClick={(e) => { e.stopPropagation(); onSelectItem(ref); onSelectDay(day.ymd) }}
                      onDoubleClick={(e) => { e.stopPropagation(); onSelectItem(ref); onSelectDay(day.ymd); onEditTask?.(t) }}
                      style={{
                        top: topPx,
                        height: heightPx,
                        left: `calc(${leftPct}% + 2px)`,
                        width: `calc(${widthPct}% - 4px)`,
                      }}
                      title={`Task: ${t.name}\nTime: ${startLabel} – ${endLabel}\nProject: ${projectCode(t.projectId)}\nStatus: ${t.status}\nClick to select · Double-click to edit`}
                      className={cn(
                        'group absolute z-10 cursor-grab active:cursor-grabbing rounded border px-1.5 py-1 shadow-sm overflow-hidden select-none transition-shadow hover:z-20 hover:shadow-md',
                        taskCardStyle(t, today),
                        isSelected && 'ring-2 ring-primary z-20',
                        (draggingId === t.id || isCut) && 'opacity-45 border-dashed',
                      )}
                    >
                      <div className="flex items-start gap-1 min-w-0 h-full">
                        <CheckSquare className="h-3 w-3 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] font-semibold truncate leading-tight">
                            {isCompact ? `${startLabel} ${t.name}` : t.name}
                          </p>
                          {!isCompact && (
                            <p className="text-[10px] opacity-80 truncate leading-tight mt-0.5">
                              {startLabel}–{endLabel} · {projectCode(t.projectId)}
                            </p>
                          )}
                        </div>
                        <div className="hidden group-hover:flex items-center gap-0.5 shrink-0 bg-white/90 rounded px-0.5 shadow-sm" onClick={(e) => e.stopPropagation()}>
                          <button onClick={() => onCopy(ref)} title="Copy task" className="p-0.5 hover:text-primary"><Copy className="h-3 w-3" /></button>
                          <button onClick={() => onCut(ref)} title="Cut task to move" className="p-0.5 hover:text-primary"><Scissors className="h-3 w-3" /></button>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
