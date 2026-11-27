import { useMemo } from 'react'
import { ArrowDown, ArrowUp, ArrowUpDown, X } from 'lucide-react'
import { NON_NPI_TASK_STATUSES, PRIORITIES, TASK_STATUSES, type Priority, type Project, type Task, type TaskStatus, type Workstream } from '@/types'
import { Badge } from '@/components/ui'
import { usePersistedState } from '@/hooks/usePersistedState'
import { InlineStatusSelect } from '@/pages/ProjectsPage'
import { updateTask } from '@/services/taskService'
import { daysUntil, formatDate } from '@/utils/helpers'

export const isOpenTask = (t: Task) => t.status !== 'Completed' && t.status !== 'Cancelled'
export const isOverdueTask = (t: Task) => isOpenTask(t) && !!t.dueDate && daysUntil(t.dueDate) < 0

// Deadline indicator: Overdue / Due today / Due in N days (within a week)
export function DeadlineBadge({ task }: { task: Task }) {
  if (!isOpenTask(task) || !task.dueDate) return null
  const d = daysUntil(task.dueDate)
  if (d < 0) return <Badge color="red">Overdue {-d}d</Badge>
  if (d === 0) return <Badge color="amber">Due today</Badge>
  if (d <= 7) return <Badge color="amber">Due in {d}d</Badge>
  return null
}

type SortKey = 'project' | 'name' | 'stage' | 'startDate' | 'dueDate' | 'priority' | 'status'
interface SortRule {
  key: SortKey
  dir: 'asc' | 'desc'
}

const PRIORITY_ORDER: Record<Priority, number> = {
  Critical: 0,
  High: 1,
  Medium: 2,
  Low: 3,
}

interface ColumnFilters {
  project: string
  name: string
  stage: string
  startDate: string
  dueDate: string
  priority: string
  status: string
}

const EMPTY_FILTERS: ColumnFilters = {
  project: '',
  name: '',
  stage: '',
  startDate: '',
  dueDate: '',
  priority: '',
  status: '',
}

interface Props {
  tasks: Task[]
  projects: Project[]
  workstreams: Workstream[]
  showProject?: boolean
  onEdit: (t: Task) => void
  onDelete?: (t: Task) => void
}

export function TaskTable({ tasks, projects, workstreams, showProject = true, onEdit }: Props) {
  const [sortChain, setSortChain] = usePersistedState<SortRule[]>('npi.taskTable.sortChain', [
    { key: 'dueDate', dir: 'asc' },
  ])
  const [colFilters, setColFilters] = usePersistedState<ColumnFilters>('npi.taskTable.colFilters', EMPTY_FILTERS)

  const proj = (id: string) => {
    const p = projects.find((x) => x.id === id)
    if (!p) return '—'
    return p.nickname || (p.packageType && !p.isNonNpi ? `${p.name} (${p.packageType})` : p.name || p.code)
  }
  const ws = (id: string) => {
    const w = workstreams.find((x) => x.id === id)
    if (!w) return '—'
    return w.name && w.name !== w.category ? `${w.category}: ${w.name}` : w.category
  }

  function toggleSort(key: SortKey) {
    setSortChain((prev) => {
      if (prev[0]?.key === key) {
        return [{ key, dir: prev[0].dir === 'asc' ? 'desc' : 'asc' }, ...prev.slice(1)]
      }
      return [{ key, dir: 'asc' }, ...prev.filter((r) => r.key !== key)].slice(0, 5)
    })
  }

  const hasActiveColFilter = Object.values(colFilters).some((v) => v.trim() !== '')

  const displayedTasks = useMemo(() => {
    const pf = colFilters.project.trim().toLowerCase()
    const nf = colFilters.name.trim().toLowerCase()
    const sf = colFilters.stage.trim().toLowerCase()
    const sdf = colFilters.startDate.trim().toLowerCase()
    const ddf = colFilters.dueDate.trim().toLowerCase()

    const filtered = tasks.filter((t) => {
      if (showProject && pf && !proj(t.projectId).toLowerCase().includes(pf)) return false
      if (nf && !t.name.toLowerCase().includes(nf)) return false
      if (sf && !ws(t.workstreamId).toLowerCase().includes(sf)) return false
      if (sdf && !`${t.startDate} ${formatDate(t.startDate)}`.toLowerCase().includes(sdf)) return false
      if (ddf && !`${t.dueDate} ${formatDate(t.dueDate)}`.toLowerCase().includes(ddf)) return false
      if (colFilters.priority && t.priority !== colFilters.priority) return false
      if (colFilters.status && t.status !== colFilters.status) return false
      return true
    })

    const getVal = (t: Task, key: SortKey): string | number => {
      switch (key) {
        case 'project':
          return proj(t.projectId).toLowerCase()
        case 'name':
          return t.name.toLowerCase()
        case 'stage':
          return ws(t.workstreamId).toLowerCase()
        case 'startDate':
          return t.startDate || '9999-99-99'
        case 'dueDate':
          return t.dueDate || '9999-99-99'
        case 'priority':
          return PRIORITY_ORDER[t.priority] ?? 99
        case 'status':
          return t.status.toLowerCase()
      }
    }

    return [...filtered].sort((a, b) => {
      for (const rule of sortChain) {
        const va = getVal(a, rule.key)
        const vb = getVal(b, rule.key)
        let cmp = 0
        if (typeof va === 'number' && typeof vb === 'number') {
          cmp = va - vb
        } else {
          cmp = String(va).localeCompare(String(vb))
        }
        if (cmp !== 0) return rule.dir === 'asc' ? cmp : -cmp
      }
      return 0
    })
  }, [tasks, projects, workstreams, showProject, colFilters, sortChain])

  const columns: { key: SortKey; label: string }[] = [
    ...(showProject ? [{ key: 'project' as SortKey, label: 'Product' }] : []),
    { key: 'name', label: 'Task' },
    { key: 'stage', label: 'Stage' },
    { key: 'startDate', label: 'Start' },
    { key: 'dueDate', label: 'Due' },
    { key: 'priority', label: 'Priority' },
    { key: 'status', label: 'Status' },
  ]

  const allStatuses = Array.from(new Set([...TASK_STATUSES, ...NON_NPI_TASK_STATUSES]))

  const renderSortIcon = (key: SortKey) => {
    const idx = sortChain.findIndex((r) => r.key === key)
    if (idx === -1) return <ArrowUpDown className="h-3 w-3 opacity-35" />
    const rule = sortChain[idx]
    const Icon = rule.dir === 'asc' ? ArrowUp : ArrowDown
    return (
      <span className={`inline-flex items-center gap-0.5 ${idx === 0 ? 'text-primary' : 'text-slate-400'}`}>
        <Icon className="h-3 w-3" />
        {idx > 0 && <span className="text-[9px] font-bold">{idx + 1}</span>}
      </span>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-600 text-left bg-slate-50 border-b border-slate-200">
          <tr>
            {columns.map((col) => (
              <th key={col.key} className="px-3 py-2 font-semibold whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => toggleSort(col.key)}
                  title="Click to sort (remembers previous column sort as tie-breaker)"
                  className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                >
                  <span>{col.label}</span>
                  {renderSortIcon(col.key)}
                </button>
              </th>
            ))}
          </tr>
          <tr className="bg-slate-50/70 border-t border-slate-200/80">
            {showProject && (
              <th className="px-2 py-1.5 font-normal">
                <input
                  type="text"
                  value={colFilters.project}
                  onChange={(e) => setColFilters((f) => ({ ...f, project: e.target.value }))}
                  placeholder="Filter…"
                  className="w-full min-w-[80px] h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </th>
            )}
            <th className="px-2 py-1.5 font-normal">
              <input
                type="text"
                value={colFilters.name}
                onChange={(e) => setColFilters((f) => ({ ...f, name: e.target.value }))}
                placeholder="Filter task…"
                className="w-full min-w-[120px] h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <input
                type="text"
                value={colFilters.stage}
                onChange={(e) => setColFilters((f) => ({ ...f, stage: e.target.value }))}
                placeholder="Filter stage…"
                className="w-full min-w-[80px] h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <input
                type="text"
                value={colFilters.startDate}
                onChange={(e) => setColFilters((f) => ({ ...f, startDate: e.target.value }))}
                placeholder="Start…"
                className="w-full min-w-[75px] h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <input
                type="text"
                value={colFilters.dueDate}
                onChange={(e) => setColFilters((f) => ({ ...f, dueDate: e.target.value }))}
                placeholder="Due…"
                className="w-full min-w-[75px] h-7 rounded border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </th>
            <th className="px-2 py-1.5 font-normal">
              <select
                value={colFilters.priority}
                onChange={(e) => setColFilters((f) => ({ ...f, priority: e.target.value }))}
                className="w-full min-w-[80px] h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">All</option>
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </th>
            <th className="px-2 py-1.5 font-normal">
              <div className="flex items-center gap-1">
                <select
                  value={colFilters.status}
                  onChange={(e) => setColFilters((f) => ({ ...f, status: e.target.value }))}
                  className="w-full min-w-[90px] h-7 rounded border border-slate-200 bg-white px-1.5 text-xs text-slate-700 focus:outline-none focus:ring-1 focus:ring-primary"
                >
                  <option value="">All</option>
                  {allStatuses.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {hasActiveColFilter && (
                  <button
                    type="button"
                    onClick={() => setColFilters(EMPTY_FILTERS)}
                    title="Clear column filters"
                    className="p-1 rounded text-slate-400 hover:text-red-600 hover:bg-slate-200/70 shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </th>
          </tr>
        </thead>
        <tbody>
          {displayedTasks.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-3 py-6 text-center text-xs text-slate-400 italic">
                No tasks match the column filters.
              </td>
            </tr>
          ) : (
            displayedTasks.map((t) => (
              <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
                {showProject && <td className="px-3 py-2.5 font-medium text-primary whitespace-nowrap">{proj(t.projectId)}</td>}
                <td className="px-3 py-2 font-medium min-w-[200px]">
                  <button
                    type="button"
                    onClick={() => onEdit(t)}
                    title="Click to edit task"
                    className="text-left w-full rounded-md px-1.5 py-1 -mx-1.5 hover:bg-primary/5 hover:text-primary transition-colors cursor-pointer"
                  >
                    {t.name}
                  </button>
                </td>
                <td className="px-3 text-slate-500 whitespace-nowrap">{ws(t.workstreamId)}</td>
                <td className="px-3 whitespace-nowrap">{formatDate(t.startDate)}</td>
                <td className="px-3 whitespace-nowrap">
                  <div className={isOverdueTask(t) ? 'text-red-600 font-medium' : ''}>
                    {formatDate(t.dueDate)}
                    {t.startTime && t.endTime && <span className="ml-1 text-[11px] text-slate-400">{t.startTime}–{t.endTime}</span>}
                  </div>
                  <DeadlineBadge task={t} />
                </td>
                <td className="px-3">
                  <InlineStatusSelect
                    value={t.priority}
                    options={PRIORITIES}
                    onChange={async (next) => {
                      await updateTask(t.id, { ...t, priority: next as Priority })
                    }}
                  />
                </td>
                <td className="px-3">
                  <InlineStatusSelect
                    value={t.status}
                    options={projects.find((p) => p.id === t.projectId)?.isNonNpi ? NON_NPI_TASK_STATUSES : TASK_STATUSES}
                    onChange={async (next) => {
                      await updateTask(t.id, { ...t, status: next as TaskStatus })
                    }}
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
