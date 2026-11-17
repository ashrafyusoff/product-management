import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { GanttChart, Plus, Table2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import { MILESTONE_STATUSES, PRIORITIES, TASK_STATUSES, type Milestone, type Project, type Task, type Workstream } from '@/types'
import { Button, Card, ConfirmDialog, EmptyState, Input, Loading, Select } from '@/components/ui'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'
import { TaskTable, isOverdueTask } from '@/features/tasks/TaskTable'
import { TaskTimeline } from '@/features/tasks/TaskTimeline'
import { MilestoneTable } from '@/features/tasks/MilestoneTable'
import { deleteTask } from '@/services/taskService'
import { deleteMilestone } from '@/services/milestoneService'
import { errorMessage } from '@/utils/validation'

const all = (label: string, opts: readonly string[]) => [{ value: '', label }, ...opts]

export function TasksPage() {
  const tasks = useTable<Task>('tasks')
  const milestones = useTable<Milestone>('milestones')
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')
  const [params, setParams] = useSearchParams()

  const [section, setSection] = usePersistedState<'tasks' | 'milestones'>('npi.tasks.section', 'tasks')
  const [view, setView] = usePersistedState<'table' | 'timeline'>('npi.tasks.view', 'table')
  const [search, setSearch] = usePersistedState<string>('npi.tasks.search', '')
  const [fProject, setFProject] = usePersistedState<string>('npi.tasks.fProject', '')
  const [fStatus, setFStatus] = usePersistedState<string>('npi.tasks.fStatus', '')
  const [fPriority, setFPriority] = usePersistedState<string>('npi.tasks.fPriority', '')
  const [onlyOverdue, setOnlyOverdue] = usePersistedState<boolean>('npi.tasks.onlyOverdue', false)

  const [taskOpen, setTaskOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<Task | undefined>()
  const [taskDeleting, setTaskDeleting] = useState<Task | undefined>()
  const [msOpen, setMsOpen] = useState(false)
  const [msEditing, setMsEditing] = useState<Milestone | undefined>()
  const [msDeleting, setMsDeleting] = useState<Milestone | undefined>()
  const [error, setError] = useState('')

  // Quick Add → New Task
  useEffect(() => {
    if (params.get('new')) { setSection('tasks'); setTaskEditing(undefined); setTaskOpen(true); setParams({}, { replace: true }) }
  }, [params, setParams])

  const filteredTasks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (tasks ?? [])
      .filter((t) => !fProject || t.projectId === fProject)
      .filter((t) => !fStatus || t.status === fStatus)
      .filter((t) => !fPriority || t.priority === fPriority)
      .filter((t) => !onlyOverdue || isOverdueTask(t))
      .filter((t) => !q || `${t.name} ${t.assignee} ${t.remarks}`.toLowerCase().includes(q))
      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
  }, [tasks, search, fProject, fStatus, fPriority, onlyOverdue])

  const filteredMilestones = useMemo(() =>
    (milestones ?? [])
      .filter((m) => !fProject || m.projectId === fProject)
      .filter((m) => !fStatus || m.status === fStatus)
      .filter((m) => !search.trim() || `${m.name} ${m.description}`.toLowerCase().includes(search.trim().toLowerCase()))
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate)),
  [milestones, search, fProject, fStatus])

  if (!tasks || !milestones || !projects || !workstreams) return <Loading />

  const projectOptions = [{ value: '', label: 'All products' }, ...projects.map((p) => ({ value: p.id, label: p.packageType && !p.isNonNpi ? `${p.name} (${p.packageType})` : p.name || p.code }))]
  const switchSection = (s: 'tasks' | 'milestones') => {
    setSection(s)
    const allowed = s === 'tasks' ? (TASK_STATUSES as readonly string[]) : (MILESTONE_STATUSES as readonly string[])
    if (fStatus && !allowed.includes(fStatus)) setFStatus('')
    setError('')
  }
  const tabCls = (on: boolean) => `px-3 py-2 text-sm border-b-2 -mb-px ${on ? 'border-primary text-primary font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`

  return (
    <div className="space-y-4">
      <div className="flex border-b border-slate-200">
        <button className={tabCls(section === 'tasks')} onClick={() => switchSection('tasks')}>Tasks <span className="text-xs text-slate-400">{tasks.length}</span></button>
        <button className={tabCls(section === 'milestones')} onClick={() => switchSection('milestones')}>Milestones <span className="text-xs text-slate-400">{milestones.length}</span></button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder={section === 'tasks' ? 'Search tasks…' : 'Search milestones…'} value={search} onChange={(e) => setSearch(e.target.value)} className="!w-56" />
        <Select className="!w-48" value={fProject} onChange={(e) => setFProject(e.target.value)} options={projectOptions} />
        <Select className="!w-44" value={fStatus} onChange={(e) => setFStatus(e.target.value)} options={all('All statuses', section === 'tasks' ? TASK_STATUSES : MILESTONE_STATUSES)} />
        {section === 'tasks' && <Select className="!w-36" value={fPriority} onChange={(e) => setFPriority(e.target.value)} options={all('All priorities', PRIORITIES)} />}
        {section === 'tasks' && (
          <label className="flex items-center gap-1.5 text-sm text-slate-600"><input type="checkbox" checked={onlyOverdue} onChange={(e) => setOnlyOverdue(e.target.checked)} /> Overdue only</label>
        )}
        <div className="ml-auto flex gap-2">
          {section === 'tasks' && (
            <div className="flex rounded-md border border-slate-200 bg-white overflow-hidden">
              <button onClick={() => setView('table')} className={`px-3 h-9 text-sm flex items-center gap-1.5 ${view === 'table' ? 'bg-primary-soft text-primary' : 'text-slate-600'}`}><Table2 className="h-4 w-4" /> Table</button>
              <button onClick={() => setView('timeline')} className={`px-3 h-9 text-sm flex items-center gap-1.5 ${view === 'timeline' ? 'bg-primary-soft text-primary' : 'text-slate-600'}`}><GanttChart className="h-4 w-4" /> Timeline</button>
            </div>
          )}
          {section === 'tasks'
            ? <Button variant="primary" onClick={() => { setTaskEditing(undefined); setTaskOpen(true) }}><Plus className="h-4 w-4" /> Add Task</Button>
            : <Button variant="primary" onClick={() => { setMsEditing(undefined); setMsOpen(true) }}><Plus className="h-4 w-4" /> Add Milestone</Button>}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card className="!p-0">
        {section === 'tasks' ? (
          filteredTasks.length === 0 ? (
            <EmptyState title={tasks.length === 0 ? 'No tasks yet' : 'No tasks match your filters'} hint={tasks.length === 0 ? 'Click "Add Task" to create your first task.' : 'Try clearing some filters.'} />
          ) : view === 'table' ? (
            <TaskTable tasks={filteredTasks} projects={projects} workstreams={workstreams}
              onEdit={(t) => { setTaskEditing(t); setTaskOpen(true) }} onDelete={setTaskDeleting} />
          ) : (
            <TaskTimeline tasks={filteredTasks} projects={projects} />
          )
        ) : filteredMilestones.length === 0 ? (
          <EmptyState title={milestones.length === 0 ? 'No milestones yet' : 'No milestones match your filters'} />
        ) : (
          <MilestoneTable milestones={filteredMilestones} projects={projects} workstreams={workstreams}
            onEdit={(m) => { setMsEditing(m); setMsOpen(true) }} onDelete={setMsDeleting} />
        )}
      </Card>

      <TaskForm open={taskOpen} task={taskEditing} defaultProjectId={fProject} onClose={() => setTaskOpen(false)} />
      <MilestoneForm open={msOpen} milestone={msEditing} defaultProjectId={fProject} onClose={() => setMsOpen(false)} />
      <ConfirmDialog open={!!taskDeleting} title="Delete task?" onCancel={() => setTaskDeleting(undefined)}
        onConfirm={async () => { try { await deleteTask(taskDeleting!.id) } catch (e) { setError(errorMessage(e)) } setTaskDeleting(undefined) }}
        message={<>Delete <b>{taskDeleting?.name}</b>?</>} />
      <ConfirmDialog open={!!msDeleting} title="Delete milestone?" onCancel={() => setMsDeleting(undefined)}
        onConfirm={async () => { try { await deleteMilestone(msDeleting!.id) } catch (e) { setError(errorMessage(e)) } setMsDeleting(undefined) }}
        message={<>Delete milestone <b>{msDeleting?.name}</b>?</>} />
    </div>
  )
}
