import { Pencil, Trash2 } from 'lucide-react'
import { NON_NPI_TASK_STATUSES, PRIORITIES, TASK_STATUSES, type Priority, type Project, type Task, type TaskStatus, type Workstream } from '@/types'
import { Badge, Button } from '@/components/ui'
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

interface Props {
  tasks: Task[]
  projects: Project[]
  workstreams: Workstream[]
  showProject?: boolean
  onEdit: (t: Task) => void
  onDelete: (t: Task) => void
}

export function TaskTable({ tasks, projects, workstreams, showProject = true, onEdit, onDelete }: Props) {
  const proj = (id: string) => {
    const p = projects.find((x) => x.id === id)
    if (!p) return '—'
    return p.packageType && !p.isNonNpi ? `${p.name} (${p.packageType})` : p.name || p.code
  }
  const ws = (id: string) => {
    const w = workstreams.find((x) => x.id === id)
    if (!w) return '—'
    return w.name && w.name !== w.category ? `${w.category}: ${w.name}` : w.category
  }
  const head = [...(showProject ? ['Product'] : []), 'Task', 'Stage', 'Start', 'Due', 'Priority', 'Status', 'Actions']
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 text-left bg-slate-50">
          <tr>{head.map((h, i) => <th key={i} className="px-3 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody>
          {tasks.map((t) => (
            <tr key={t.id} className="border-t border-slate-100 hover:bg-slate-50">
              {showProject && <td className="px-3 py-2.5 font-medium text-primary whitespace-nowrap">{proj(t.projectId)}</td>}
              <td className="px-3 font-medium min-w-[200px]">{t.name}</td>
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
              <td className="px-3">
                <div className="flex gap-1">
                  <Button variant="ghost" size="sm" aria-label="Edit task" onClick={() => onEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="sm" aria-label="Delete task" onClick={() => onDelete(t)}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
