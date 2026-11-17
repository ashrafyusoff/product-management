import { useMemo } from 'react'
import { Diamond, FolderKanban, GitBranch, ListChecks } from 'lucide-react'
import type { Milestone, Project, Task, Workstream } from '@/types'
import { Badge } from '@/components/ui'
import { formatDate, isPast, todayStr } from '@/utils/helpers'

const DAY = 86400000
const toMs = (s: string) => new Date(s).getTime()

interface GanttItem {
  id: string
  category: 'project' | 'stage' | 'milestone' | 'task'
  label: string
  sublabel?: string
  startDate: string
  endDate: string
  progress: number
  status: string
  isPoint?: boolean
  isLate?: boolean
  tooltip: string
}

function stageLabel(w: Workstream) {
  if (w.name && w.name !== w.category) return `${w.category}: ${w.name}`
  return w.category
}

export function ProjectGanttChart({
  project: p,
  workstreams,
  milestones,
  tasks,
}: {
  project: Project
  workstreams: Workstream[]
  milestones: Milestone[]
  tasks: Task[]
}) {
  const { items, minMs, maxMs, ticks, todayPct } = useMemo(() => {
    const today = todayStr()
    const projStart = p.startDate || p.createdAt?.slice(0, 10) || today
    const projEnd = p.baselineDate || (toMs(projStart) + 30 * DAY > toMs(today) ? new Date(toMs(projStart) + 30 * DAY).toISOString().slice(0, 10) : today)

    const list: GanttItem[] = []

    // 1. Main Product Bar
    list.push({
      id: `proj-${p.id}`,
      category: 'project',
      label: `${p.name}${p.packageType ? ` · ${p.packageType}` : ''}`,
      sublabel: p.code,
      startDate: projStart,
      endDate: projEnd >= projStart ? projEnd : projStart,
      progress: p.progress,
      status: p.status,
      isLate: p.status !== 'Completed' && !!p.baselineDate && isPast(p.baselineDate),
      tooltip: `${p.name} (${p.packageType || p.code})\nStart: ${formatDate(projStart)} → Target: ${formatDate(p.baselineDate)}\nStatus: ${p.status}`,
    })

    // 2. Product Stages
    for (const w of workstreams) {
      const dStart = w.startDate || projStart
      const dEndRaw = w.actualDate || w.targetDate || projEnd
      const dEnd = dEndRaw >= dStart ? dEndRaw : dStart
      const late = !w.actualDate && !!w.targetDate && isPast(w.targetDate) && w.status !== 'Done'

      list.push({
        id: `stage-${w.id}`,
        category: 'stage',
        label: stageLabel(w),
        sublabel: w.remarks || w.category,
        startDate: dStart,
        endDate: dEnd,
        progress: w.progress,
        status: w.status,
        isLate: !!late || w.status === 'Risk' || w.status === 'Urgent',
        tooltip: `${stageLabel(w)}\nStart: ${formatDate(dStart)} → Target: ${formatDate(dEnd)}\nStatus: ${w.status}`,
      })
    }

    // 3. NPI / HRS Milestones
    const sortedMs = [...milestones].sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'))
    for (const m of sortedMs) {
      const mDate = m.actualDate || m.targetDate || projEnd
      const late = m.status !== 'Completed' && !!m.targetDate && isPast(m.targetDate)
      list.push({
        id: `ms-${m.id}`,
        category: 'milestone',
        label: m.name,
        sublabel: `Target: ${formatDate(m.targetDate)}${m.actualDate ? ` · Actual: ${formatDate(m.actualDate)}` : ''}`,
        startDate: mDate,
        endDate: mDate,
        progress: m.status === 'Completed' ? 100 : m.status === 'In Progress' ? 50 : 0,
        status: m.status,
        isPoint: true,
        isLate: late || m.status === 'Delayed',
        tooltip: `Milestone: ${m.name}\nTarget: ${formatDate(m.targetDate)}${m.actualDate ? `\nActual: ${formatDate(m.actualDate)}` : ''}\nStatus: ${m.status}`,
      })
    }

    // 4. Tasks
    const sortedTasks = [...tasks].sort((a, b) => (a.startDate || a.dueDate || '9999').localeCompare(b.startDate || b.dueDate || '9999'))
    for (const t of sortedTasks) {
      const ws = workstreams.find((w) => w.id === t.workstreamId)
      const tStart = t.startDate || t.dueDate || projStart
      const tEndRaw = t.dueDate || t.completionDate || tStart
      const tEnd = tEndRaw >= tStart ? tEndRaw : tStart
      const late = t.status !== 'Completed' && t.status !== 'Cancelled' && !!t.dueDate && isPast(t.dueDate)
      list.push({
        id: `task-${t.id}`,
        category: 'task',
        label: t.name,
        sublabel: `${ws ? `${stageLabel(ws)} · ` : ''}${formatDate(t.startDate)} → ${formatDate(t.dueDate)}`,
        startDate: tStart,
        endDate: tEnd,
        progress: t.progress,
        status: t.status,
        isLate: late,
        tooltip: `Task: ${t.name}\n${formatDate(t.startDate)} → ${formatDate(t.dueDate)}\nStatus: ${t.status}`,
      })
    }

    const allDates = [
      ...list.flatMap((i) => [toMs(i.startDate), toMs(i.endDate)]),
      toMs(today),
    ].filter((n) => !isNaN(n))

    const rawMin = Math.min(...allDates)
    const rawMax = Math.max(...allDates)
    const span = Math.max(rawMax - rawMin, 14 * DAY)
    const minMs = rawMin - Math.max(4 * DAY, Math.round(span * 0.06))
    const maxMs = rawMax + Math.max(6 * DAY, Math.round(span * 0.08))
    const totalMs = Math.max(maxMs - minMs, DAY)

    // Generate clean timeline date ticks ( ~8 ticks across the range )
    const tickCount = 8
    const ticks: { label: string; pct: number }[] = []
    for (let i = 0; i <= tickCount; i++) {
      const t = minMs + (totalMs * i) / tickCount
      ticks.push({
        label: new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' }),
        pct: (i / tickCount) * 100,
      })
    }

    const todayPct = Math.max(0, Math.min(100, ((toMs(today) - minMs) / totalMs) * 100))

    return { items: list, minMs, maxMs, ticks, todayPct }
  }, [p, workstreams, milestones, tasks])

  const totalSpan = Math.max(maxMs - minMs, DAY)
  const pctOf = (dateStr: string) => Math.max(0, Math.min(100, ((toMs(dateStr) - minMs) / totalSpan) * 100))

  const barBg = (item: GanttItem) => {
    if (item.status === 'Completed' || item.status === 'Done') return 'bg-emerald-500'
    if (item.isLate || item.status === 'Delayed' || item.status === 'Urgent' || item.status === 'Risk') return 'bg-red-500'
    if (item.category === 'project') return 'bg-blue-600'
    if (item.category === 'stage') return 'bg-indigo-500'
    if (item.category === 'milestone') return 'bg-amber-500'
    return 'bg-sky-500'
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-blue-600" /> HRS Schedule</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-indigo-500" /> Deliverable & Commercial</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rotate-45 bg-amber-500" /> NPI Milestone</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Task</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Completed / Delivered</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Delayed / Overdue</span>
        </div>
        <span className="text-[11px] text-slate-400">Red vertical line = Today ({formatDate(todayStr())})</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div className="min-w-[880px]">
          {/* Header Row */}
          <div className="flex border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
            <div className="w-72 shrink-0 px-3 py-2.5 border-r border-slate-200">NPI / HRS Item</div>
            <div className="w-40 shrink-0 px-3 py-2.5 border-r border-slate-200">Status</div>
            <div className="relative flex-1 h-9">
              {ticks.map((t, idx) => (
                <span
                  key={idx}
                  className="absolute top-2.5 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-500"
                  style={{ left: `${Math.min(96, Math.max(4, t.pct))}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {/* Gantt Rows */}
          {items.map((item) => {
            const left = pctOf(item.startDate)
            const right = pctOf(item.endDate)
            const width = Math.max(right - left, 1.4)
            return (
              <div
                key={item.id}
                className={`flex items-center border-b last:border-b-0 border-slate-100 hover:bg-slate-50/80 text-xs ${
                  item.category === 'project' ? 'bg-blue-50/30 font-semibold' : ''
                }`}
              >
                {/* Item column */}
                <div className="w-72 shrink-0 px-3 py-2 border-r border-slate-200 min-w-0">
                  <div className="flex items-center gap-1.5 truncate">
                    {item.category === 'project' && <FolderKanban className="h-3.5 w-3.5 text-primary shrink-0" />}
                    {item.category === 'stage' && <GitBranch className="h-3.5 w-3.5 text-indigo-600 shrink-0 ml-2" />}
                    {item.category === 'milestone' && <Diamond className="h-3.5 w-3.5 text-amber-600 shrink-0 ml-2" />}
                    {item.category === 'task' && <ListChecks className="h-3.5 w-3.5 text-sky-600 shrink-0 ml-2" />}
                    <span className="truncate text-slate-800" title={item.label}>{item.label}</span>
                  </div>
                  {item.sublabel && (
                    <div className="text-[11px] text-slate-500 truncate pl-5 font-normal" title={item.sublabel}>
                      {item.sublabel}
                    </div>
                  )}
                </div>

                {/* Status / Progress column */}
                <div className="w-40 shrink-0 px-3 py-2 border-r border-slate-200 flex items-center justify-between gap-1">
                  <Badge>{item.status}</Badge>
                </div>

                {/* Timeline Bar Area */}
                <div className="relative flex-1 h-11">
                  {ticks.map((t, idx) => (
                    <span key={idx} className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${t.pct}%` }} />
                  ))}
                  {/* Today Marker */}
                  <span
                    className="absolute inset-y-0 border-l-2 border-red-400/80 z-10 pointer-events-none"
                    style={{ left: `${todayPct}%` }}
                    title={`Today: ${formatDate(todayStr())}`}
                  />

                  {item.isPoint ? (
                    <div
                      className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 group cursor-pointer"
                      style={{ left: `${left}%` }}
                      title={item.tooltip}
                    >
                      <div className={`h-3.5 w-3.5 rotate-45 rounded-[2px] border border-white shadow ${barBg(item)}`} />
                      <span className="text-[10px] font-semibold text-slate-700 bg-white/90 px-1 rounded shadow-sm whitespace-nowrap">
                        {formatDate(item.startDate)}
                      </span>
                    </div>
                  ) : (
                    <div
                      className={`absolute top-3 h-5 rounded-md ${barBg(item)} bg-opacity-85 shadow-sm overflow-hidden cursor-pointer`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                      title={item.tooltip}
                    >
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

