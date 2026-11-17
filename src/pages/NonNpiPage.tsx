import { useMemo, useState } from 'react'
import { Briefcase, ChevronDown, ChevronRight, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import {
  ACTIVE_PROJECT_STATUSES,
  NON_NPI_CATEGORIES,
  NON_NPI_TASK_STATUSES,
  PRIORITIES,
  PROJECT_STATUSES,
  isArchivedStatus,
  type Priority,
  type Project,
  type ProjectStatus,
  type Task,
  type TaskStatus,
} from '@/types'
import {
  Badge,
  Button,
  Card,
  ConfirmDialog,
  EmptyState,
  Field,
  FormError,
  Input,
  Loading,
  Modal,
  Select,
  Textarea,
} from '@/components/ui'
import { InlineStatusSelect } from './ProjectsPage'
import { TaskForm } from '@/features/tasks/TaskForm'
import { DeadlineBadge, isOverdueTask } from '@/features/tasks/TaskTable'
import { createProject, deleteProject, emptyProject, updateProject, type ProjectInput } from '@/services/projectService'
import { deleteTask, updateTask } from '@/services/taskService'
import { loadSampleData } from '@/services/sampleData'
import { formatDate, isPast, todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

const COLLAPSED_KEY = 'npi.nonNpi.collapsedIds'
const DAY = 86400000
const toMs = (s: string) => new Date(s).getTime()

/**
 * Computes the lowest available running number `A-001`, `A-002`, ... across all existing
 * (active AND archived) Non-NPI Work items. If an active Non-NPI Work item is deleted,
 * its number is no longer in `db.projects` and is automatically reused; if it was archived,
 * it remains in `db.projects` so its running number is never reused.
 */
export function getNextNonNpiRunningTag(allProjects: Project[], ignoreId?: string): string {
  const used = new Set<number>()
  for (const p of allProjects) {
    if (!p.isNonNpi || p.id === ignoreId) continue
    const match = p.code.match(/A-(\d+)\b/i)
    if (match) {
      const num = parseInt(match[1], 10)
      if (!isNaN(num) && num > 0) used.add(num)
    }
  }
  let n = 1
  while (used.has(n)) n++
  return `A-${String(n).padStart(3, '0')}`
}

export function formatCategoryHeader(p: Project): string {
  const match = p.code.match(/A-\d{3,}/i)
  const cat = p.nonNpiCategory || 'Ad-hoc Task'
  if (match) return `${cat} ${match[0].toUpperCase()}`
  return p.code || cat
}

export function NonNpiPage() {
  const projects = useTable<Project>('projects')
  const tasks = useTable<Task>('tasks')

  const [tab, setTab] = usePersistedState<'main' | 'gantt'>('npi.nonNpi.tab', 'main')
  const [search, setSearch] = usePersistedState<string>('npi.nonNpi.search', '')
  const [category, setCategory] = usePersistedState<string>('npi.nonNpi.category', '')
  const [priority, setPriority] = usePersistedState<string>('npi.nonNpi.priority', '')
  const [status, setStatus] = usePersistedState<string>('npi.nonNpi.status', '')
  const [collapsedIds, setCollapsedIds] = usePersistedState<Record<string, boolean>>(COLLAPSED_KEY, {})

  const [workModalOpen, setWorkModalOpen] = useState(false)
  const [editingWork, setEditingWork] = useState<Project | undefined>()
  const [deletingWork, setDeletingWork] = useState<Project | undefined>()
  const [archivingWork, setArchivingWork] = useState<{ project: Project; nextStatus: ProjectStatus } | undefined>()

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [taskProjectId, setTaskProjectId] = useState('')
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [deletingTask, setDeletingTask] = useState<Task | undefined>()
  const [error, setError] = useState('')

  const nonNpiWorks = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (projects ?? [])
      .filter((p) => !!p.isNonNpi && !isArchivedStatus(p.status))
      .filter((p) => !category || (p.nonNpiCategory || 'Ad-hoc Task') === category)
      .filter((p) => !priority || p.priority === priority)
      .filter((p) => !status || p.status === status)
      .filter((p) => {
        if (!q) return true
        const pTasks = (tasks ?? []).filter((t) => t.projectId === p.id)
        const taskText = pTasks.map((t) => `${t.name} ${t.remarks}`).join(' ')
        return `${p.code} ${p.name} ${p.nonNpiCategory ?? ''} ${p.description} ${taskText}`.toLowerCase().includes(q)
      })
      .sort((a, b) => a.code.localeCompare(b.code))
  }, [projects, tasks, search, category, priority, status])

  if (!projects || !tasks) return <Loading />

  const tabCls = (active: boolean) =>
    `px-3 py-2 text-sm border-b-2 -mb-px ${active ? 'border-primary text-primary font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'}`

  return (
    <div className="space-y-4">
      {/* Simple 2-Tab Navigation */}
      <div className="flex items-center justify-between border-b border-slate-200">
        <div className="flex">
          <button className={tabCls(tab === 'main')} onClick={() => setTab('main')}>
            Work & Tasks <span className="ml-1 text-xs text-slate-400">{nonNpiWorks.length}</span>
          </button>
          <button className={tabCls(tab === 'gantt')} onClick={() => setTab('gantt')}>
            Gantt Chart View
          </button>
        </div>
      </div>

      {/* Filters & Actions */}
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search category, A-001, title, tasks…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="!w-72"
        />
        <Select
          className="!w-44"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[{ value: '', label: 'All categories' }, ...NON_NPI_CATEGORIES]}
        />
        <Select
          className="!w-36"
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          options={[{ value: '', label: 'All priorities' }, ...PRIORITIES]}
        />
        <Select
          className="!w-40"
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[{ value: '', label: 'All statuses' }, ...ACTIVE_PROJECT_STATUSES]}
        />
        <Button
          variant="primary"
          className="ml-auto"
          onClick={() => {
            setEditingWork(undefined)
            setWorkModalOpen(true)
          }}
        >
          <Plus className="h-4 w-4" /> Create Side-Quest
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {tab === 'main' && (
        <Card className="!p-0">
          {nonNpiWorks.length === 0 ? (
            <EmptyState
              title="No Side-Quest items yet"
              hint='Click "Create Side-Quest" to track ad-hoc tasks, DOEs, web development, or continuous improvement projects, or load sample data.'
              action={
                <div className="flex gap-2">
                  <Button variant="primary" onClick={() => { setEditingWork(undefined); setWorkModalOpen(true) }}>
                    Create Side-Quest
                  </Button>
                  <Button onClick={() => loadSampleData()}>Load Sample Data</Button>
                </div>
              }
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-xs text-slate-600 text-left bg-slate-100">
                  <tr className="whitespace-nowrap">
                    <th className="w-px px-2 py-2.5 font-semibold whitespace-nowrap">Category</th>
                    <th className="px-3 py-2.5 font-semibold whitespace-nowrap min-w-[300px]">Title / Description</th>
                    <th className="w-px px-2 py-2.5 font-semibold whitespace-nowrap">Priority</th>
                    <th className="w-px px-2 py-2.5 font-semibold whitespace-nowrap">Status</th>
                    <th className="w-px px-2 py-2.5 font-semibold whitespace-nowrap">Start → Target / Due</th>
                    <th className="w-px px-2 py-2.5 font-semibold whitespace-nowrap">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {nonNpiWorks.map((w) => {
                    const wTasks = tasks
                      .filter((t) => t.projectId === w.id)
                      .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999'))
                    const isCollapsed = !!collapsedIds[w.id]
                    return (
                      <NonNpiWorkGroup
                        key={w.id}
                        work={w}
                        tasks={wTasks}
                        collapsed={isCollapsed}
                        onToggleCollapse={() => setCollapsedIds((prev) => ({ ...prev, [w.id]: !prev[w.id] }))}
                        onEditWork={() => { setEditingWork(w); setWorkModalOpen(true) }}
                        onDeleteWork={() => setDeletingWork(w)}
                        onRequestArchive={(nextStatus) => setArchivingWork({ project: w, nextStatus })}
                        onAddTask={() => { setTaskProjectId(w.id); setEditingTask(undefined); setTaskModalOpen(true) }}
                        onEditTask={(t) => { setTaskProjectId(w.id); setEditingTask(t); setTaskModalOpen(true) }}
                        onDeleteTask={(t) => setDeletingTask(t)}
                        onError={setError}
                      />
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Second tab ONLY for Gantt Chart */}
      {tab === 'gantt' && (
        <Card title="Side-Quest & Tasks — Master Gantt Chart">
          {nonNpiWorks.length === 0 ? (
            <EmptyState
              title="No Side-Quest items to display"
              hint="Create a Side-Quest item or clear filters to view the Gantt chart."
            />
          ) : (
            <NonNpiGanttChart works={nonNpiWorks} tasks={tasks} />
          )}
        </Card>
      )}

      <NonNpiWorkModal
        open={workModalOpen}
        project={editingWork}
        allProjects={projects}
        onClose={() => setWorkModalOpen(false)}
      />

      <TaskForm
        open={taskModalOpen}
        task={editingTask}
        defaultProjectId={taskProjectId}
        nonNpiOnly
        onClose={() => { setTaskModalOpen(false); setEditingTask(undefined) }}
      />

      <ConfirmDialog
        open={!!deletingWork}
        title="Delete Side-Quest?"
        onCancel={() => setDeletingWork(undefined)}
        onConfirm={async () => {
          if (!deletingWork) return
          try { await deleteProject(deletingWork.id); setDeletingWork(undefined) } catch (e) { setError(errorMessage(e)); setDeletingWork(undefined) }
        }}
        message={<>Delete <b>{deletingWork ? formatCategoryHeader(deletingWork) : ''} – {deletingWork?.name}</b> and all tasks linked to it? Its running number will become available for reuse.</>}
      />

      <ConfirmDialog
        open={!!deletingTask}
        title="Delete task?"
        onCancel={() => setDeletingTask(undefined)}
        onConfirm={async () => {
          if (!deletingTask) return
          try { await deleteTask(deletingTask.id); setDeletingTask(undefined) } catch (e) { setError(errorMessage(e)); setDeletingTask(undefined) }
        }}
        message={<>Delete task <b>{deletingTask?.name}</b>?</>}
      />

      <ConfirmDialog
        open={!!archivingWork}
        title={`Move ${archivingWork ? formatCategoryHeader(archivingWork.project) : ''} to Archived?`}
        confirmLabel={`Confirm & Archive (${archivingWork?.nextStatus ?? ''})`}
        onCancel={() => setArchivingWork(undefined)}
        onConfirm={async () => {
          if (!archivingWork) return
          try {
            await updateProject(archivingWork.project.id, { ...archivingWork.project, status: archivingWork.nextStatus })
            setArchivingWork(undefined)
          } catch (e) {
            setError(errorMessage(e))
            setArchivingWork(undefined)
          }
        }}
        message={
          <>
            Changing the status of <b>{archivingWork ? formatCategoryHeader(archivingWork.project) : ''} ({archivingWork?.project.name})</b> to <b>{archivingWork?.nextStatus}</b> will move it to the <b>Archived</b> tab and lock its running number permanently. <b>This action is non-returnable.</b> Proceed?
          </>
        }
      />
    </div>
  )
}

function NonNpiWorkGroup({
  work: p,
  tasks,
  collapsed,
  onToggleCollapse,
  onEditWork,
  onDeleteWork,
  onRequestArchive,
  onAddTask,
  onEditTask,
  onDeleteTask,
  onError,
}: {
  work: Project
  tasks: Task[]
  collapsed: boolean
  onToggleCollapse: () => void
  onEditWork: () => void
  onDeleteWork: () => void
  onRequestArchive: (nextStatus: ProjectStatus) => void
  onAddTask: () => void
  onEditTask: (t: Task) => void
  onDeleteTask: (t: Task) => void
  onError: (msg: string) => void
}) {
  const categoryLabel = formatCategoryHeader(p)
  return (
    <>
      <tr className="border-t border-slate-200 bg-white hover:bg-slate-50 font-medium">
        <td className="px-2 py-2.5 whitespace-nowrap">
          <div className="flex items-center gap-1">
            {/* Add Task button placed on the left inside the Category column to save space */}
            <Button
              size="sm"
              variant="ghost"
              className="!h-6 !px-1.5 text-[11px] text-primary border border-primary/25 bg-primary-soft/50 hover:bg-primary-soft dark:bg-blue-600/25 dark:text-blue-200 dark:border-blue-400/60 dark:hover:bg-blue-600/45 dark:hover:text-white"
              onClick={onAddTask}
              title="Add task to this Side-Quest"
            >
              <Plus className="h-3 w-3" /> Task
            </Button>
            <button
              type="button"
              onClick={onToggleCollapse}
              className="p-0.5 rounded hover:bg-slate-200 text-slate-600"
              title={collapsed ? 'Expand tasks' : 'Collapse tasks'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <Badge color="violet">{categoryLabel}</Badge>
            <span className="text-[11px] font-normal text-slate-400">({tasks.length})</span>
          </div>
        </td>
        <td className="px-3 py-2.5 min-w-[300px]">
          <div className="font-semibold text-slate-900" title={p.name}>{p.name}</div>
          {p.description && <div className="text-xs font-normal text-slate-500 line-clamp-2" title={p.description}>{p.description}</div>}
        </td>
        <td className="px-2 py-2.5">
          <InlineStatusSelect
            value={p.priority}
            options={PRIORITIES}
            onChange={async (next) => {
              try { await updateProject(p.id, { ...p, priority: next as Priority }) } catch (e) { onError(errorMessage(e)) }
            }}
          />
        </td>
        <td className="px-2 py-2.5">
          <InlineStatusSelect
            value={p.status}
            options={PROJECT_STATUSES}
            onChange={async (next) => {
              const nextStatus = next as ProjectStatus
              if (isArchivedStatus(nextStatus)) {
                onRequestArchive(nextStatus)
                return
              }
              try { await updateProject(p.id, { ...p, status: nextStatus }) } catch (e) { onError(errorMessage(e)) }
            }}
          />
        </td>
        <td className="px-2 py-2.5 whitespace-nowrap text-xs text-slate-600">
          {formatDate(p.startDate)} → <span className="font-medium text-slate-800">{formatDate(p.baselineDate)}</span>
        </td>
        <td className="px-2 py-2.5 whitespace-nowrap">
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" aria-label="Edit Side-Quest" onClick={onEditWork}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" aria-label="Delete Side-Quest" onClick={onDeleteWork}>
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          </div>
        </td>
      </tr>

      {/* Sub-Tasks connected to the main Workweek Calendar & Activities dashboard */}
      {!collapsed && tasks.map((t, idx) => {
        const isLast = idx === tasks.length - 1
        return (
          <tr key={t.id} className="border-t border-slate-100 bg-slate-50/75 hover:bg-blue-50/40 text-xs">
            <td className="pl-10 pr-2 py-2 whitespace-nowrap text-slate-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-slate-400 font-bold text-sm leading-none">{isLast ? '└─' : '├─'}</span>
                <ListChecks className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                <span className="text-[11px] font-medium text-slate-400">Task</span>
              </span>
            </td>
            <td className="px-3 py-2 min-w-[300px]">
              <button
                onClick={() => onEditTask(t)}
                className="font-semibold text-slate-800 hover:text-primary hover:underline text-left block"
                title={t.name}
              >
                {t.name}
              </button>
              {t.remarks && <div className="text-[11px] text-slate-500 line-clamp-2" title={t.remarks}>{t.remarks}</div>}
            </td>
            <td className="px-2 py-2">
              <InlineStatusSelect
                value={t.priority}
                options={PRIORITIES}
                onChange={async (next) => {
                  try { await updateTask(t.id, { ...t, priority: next as Priority }) } catch (e) { onError(errorMessage(e)) }
                }}
              />
            </td>
            <td className="px-2 py-2">
              <InlineStatusSelect
                value={t.status}
                options={NON_NPI_TASK_STATUSES}
                onChange={async (next) => {
                  try { await updateTask(t.id, { ...t, status: next as TaskStatus }) } catch (e) { onError(errorMessage(e)) }
                }}
              />
            </td>
            <td className="px-2 py-2 whitespace-nowrap">
              <span className={isOverdueTask(t) ? 'text-red-600 font-semibold' : 'text-slate-600'}>
                {formatDate(t.startDate)} → {formatDate(t.dueDate)}
              </span>
              <span className="ml-1.5"><DeadlineBadge task={t} /></span>
            </td>
            <td className="px-2 py-2 whitespace-nowrap">
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" title="Edit task" onClick={() => onEditTask(t)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" title="Delete task" onClick={() => onDeleteTask(t)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}

function NonNpiWorkModal({
  open,
  project,
  allProjects,
  onClose,
}: {
  open: boolean
  project?: Project
  allProjects: Project[]
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={project ? 'Edit Side-Quest' : 'Create Side-Quest'} wide>
      <NonNpiWorkFormBody
        key={`${open ? 'open' : 'closed'}-${project?.id ?? 'new'}-${project?.updatedAt ?? ''}`}
        project={project}
        allProjects={allProjects}
        onClose={onClose}
      />
    </Modal>
  )
}

function NonNpiWorkFormBody({
  project,
  allProjects,
  onClose,
}: {
  project?: Project
  allProjects: Project[]
  onClose: () => void
}) {
  const runningTag = useMemo(() => {
    if (project) {
      const existingMatch = project.code.match(/A-\d{3,}/i)
      if (existingMatch) return existingMatch[0].toUpperCase()
    }
    return getNextNonNpiRunningTag(allProjects, project?.id)
  }, [project, allProjects])

  const initialCat = project?.nonNpiCategory || 'DOE'
  const isInitialPreset = NON_NPI_CATEGORIES.includes(initialCat as (typeof NON_NPI_CATEGORIES)[number])

  const [categorySelect, setCategorySelect] = useState<string>(isInitialPreset ? initialCat : 'Others')
  const [customCategory, setCustomCategory] = useState<string>(isInitialPreset ? '' : initialCat)

  const [form, setForm] = useState<ProjectInput>(() =>
    project
      ? {
          ...project,
          isNonNpi: true,
          startDate: project.startDate || project.createdAt?.slice(0, 10) || todayStr(),
        }
      : {
          ...emptyProject(),
          isNonNpi: true,
          nonNpiCategory: 'DOE',
          priority: 'Medium',
          status: 'In Progress',
          startDate: todayStr(),
        },
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }))
  const previewCategory = categorySelect === 'Others' ? customCategory.trim() || 'Others' : categorySelect
  const generatedHeader = `${previewCategory} ${runningTag}`

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (categorySelect === 'Others' && !customCategory.trim()) {
      setError('Please specify the category name for "Others".')
      return
    }
    if (!form.name.trim()) {
      setError('Work / Project Title is required.')
      return
    }
    const finalCategory = categorySelect === 'Others' ? customCategory.trim() : categorySelect
    const finalCode = `${finalCategory} ${runningTag}`
    setSaving(true)
    try {
      const payload: ProjectInput = {
        ...form,
        code: finalCode,
        isNonNpi: true,
        nonNpiCategory: finalCategory,
        packageType: finalCategory,
        name: form.name.trim(),
        startDate: form.startDate || todayStr(),
      }
      if (project) await updateProject(project.id, payload)
      else await createProject(payload)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label={`Category (Auto ID: ${generatedHeader})`} required>
          <Select
            options={NON_NPI_CATEGORIES}
            value={categorySelect}
            onChange={(e) => setCategorySelect(e.target.value)}
          />
        </Field>
        {categorySelect === 'Others' && (
          <Field label="Specify Category (Others)" required>
            <Input value={customCategory} onChange={(e) => setCustomCategory(e.target.value)} placeholder="Write category…" />
          </Field>
        )}
        <Field label="Work / Project Title" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Yield Correlation DOE, Tracker Web UI" />
        </Field>
        <Field label="Priority">
          <Select options={PRIORITIES} value={form.priority} onChange={(e) => set('priority', e.target.value as Priority)} />
        </Field>
        <Field label="Status">
          <Select options={PROJECT_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value as ProjectStatus)} />
        </Field>
        <Field label="Start Date (Creation Date)">
          <Input type="date" value={form.startDate} disabled readOnly className="bg-slate-100 text-slate-500 cursor-not-allowed" />
        </Field>
        <Field label="Target / Due Date">
          <Input type="date" value={form.baselineDate} onChange={(e) => set('baselineDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Description / Scope">
        <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save Side-Quest'}</Button>
      </div>
    </form>
  )
}

function NonNpiGanttChart({ works, tasks }: { works: Project[]; tasks: Task[] }) {
  const { items, minMs, maxMs, ticks, todayPct } = useMemo(() => {
    const today = todayStr()
    const list: {
      id: string
      kind: 'work' | 'task'
      label: string
      sublabel: string
      startDate: string
      endDate: string
      status: string
      priority: string
      progress: number
      isLate: boolean
    }[] = []

    for (const w of works) {
      const wStart = w.startDate || w.createdAt?.slice(0, 10) || today
      const wEndRaw = w.baselineDate || wStart
      const wEnd = wEndRaw >= wStart ? wEndRaw : wStart
      const header = formatCategoryHeader(w)
      list.push({
        id: `work-${w.id}`,
        kind: 'work',
        label: `${header} · ${w.name}`,
        sublabel: `Priority: ${w.priority}`,
        startDate: wStart,
        endDate: wEnd,
        status: w.status,
        priority: w.priority,
        progress: w.progress,
        isLate: w.status !== 'Completed' && !!w.baselineDate && isPast(w.baselineDate),
      })

      const wTasks = tasks
        .filter((t) => t.projectId === w.id)
        .sort((a, b) => (a.startDate || a.dueDate || '9999').localeCompare(b.startDate || b.dueDate || '9999'))

      for (const t of wTasks) {
        const tStart = t.startDate || t.dueDate || wStart
        const tEndRaw = t.dueDate || t.completionDate || tStart
        const tEnd = tEndRaw >= tStart ? tEndRaw : tStart
        list.push({
          id: `task-${t.id}`,
          kind: 'task',
          label: t.name,
          sublabel: `${formatDate(tStart)} → ${formatDate(tEnd)} · Priority: ${t.priority}`,
          startDate: tStart,
          endDate: tEnd,
          status: t.status,
          priority: t.priority,
          progress: t.status === 'Completed' ? 100 : t.progress,
          isLate: t.status !== 'Completed' && t.status !== 'Cancelled' && !!t.dueDate && isPast(t.dueDate),
        })
      }
    }

    const allDates = [...list.flatMap((i) => [toMs(i.startDate), toMs(i.endDate)]), toMs(today)].filter((n) => !isNaN(n))
    const rawMin = Math.min(...allDates)
    const rawMax = Math.max(...allDates)
    const span = Math.max(rawMax - rawMin, 14 * DAY)
    const minMs = rawMin - Math.max(3 * DAY, Math.round(span * 0.06))
    const maxMs = rawMax + Math.max(5 * DAY, Math.round(span * 0.08))
    const totalMs = Math.max(maxMs - minMs, DAY)

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
  }, [works, tasks])

  const totalSpan = Math.max(maxMs - minMs, DAY)
  const pctOf = (dateStr: string) => Math.max(0, Math.min(100, ((toMs(dateStr) - minMs) / totalSpan) * 100))

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-600" /> Side-Quest</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Sub-Task</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" /> Completed</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-red-500" /> Overdue / Delayed</span>
        </div>
        <span className="text-[11px] text-slate-400">Red vertical line = Today ({formatDate(todayStr())})</span>
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
        <div className="min-w-[860px]">
          <div className="flex border-b border-slate-200 bg-slate-100 text-xs font-semibold text-slate-700">
            <div className="w-72 shrink-0 px-3 py-2 border-r border-slate-200">Category / Task</div>
            <div className="w-40 shrink-0 px-3 py-2 border-r border-slate-200">Status</div>
            <div className="relative flex-1 h-8">
              {ticks.map((t, idx) => (
                <span
                  key={idx}
                  className="absolute top-2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium text-slate-500"
                  style={{ left: `${Math.min(96, Math.max(4, t.pct))}%` }}
                >
                  {t.label}
                </span>
              ))}
            </div>
          </div>

          {items.map((item) => {
            const left = pctOf(item.startDate)
            const right = pctOf(item.endDate)
            const width = Math.max(right - left, 1.8)
            const bg =
              item.status === 'Completed'
                ? 'bg-emerald-500'
                : item.isLate || item.status === 'Delayed'
                  ? 'bg-red-500'
                  : item.kind === 'work'
                    ? 'bg-violet-600'
                    : 'bg-sky-500'

            return (
              <div
                key={item.id}
                className={`flex items-center border-b last:border-b-0 border-slate-100 text-xs ${
                  item.kind === 'work' ? 'bg-violet-50/30 font-semibold' : ''
                }`}
              >
                <div className="w-72 shrink-0 px-3 py-2 border-r border-slate-200 min-w-0">
                  <div className="flex items-center gap-1.5 truncate">
                    {item.kind === 'work' ? (
                      <Briefcase className="h-3.5 w-3.5 text-violet-600 shrink-0" />
                    ) : (
                      <ListChecks className="h-3.5 w-3.5 text-sky-600 shrink-0 ml-3" />
                    )}
                    <span className="truncate text-slate-800">{item.label}</span>
                  </div>
                  <div className="text-[10px] text-slate-500 truncate pl-5 font-normal">{item.sublabel}</div>
                </div>

                <div className="w-40 shrink-0 px-3 py-2 border-r border-slate-200 flex items-center justify-between gap-1">
                  <Badge>{item.status}</Badge>
                </div>

                <div className="relative flex-1 h-10">
                  {ticks.map((t, idx) => (
                    <span key={idx} className="absolute inset-y-0 border-l border-slate-100" style={{ left: `${t.pct}%` }} />
                  ))}
                  <span
                    className="absolute inset-y-0 border-l-2 border-red-400/80 z-10 pointer-events-none"
                    style={{ left: `${todayPct}%` }}
                  />
                  <div
                    className={`absolute top-2.5 h-5 rounded-md ${bg} bg-opacity-85 shadow-sm overflow-hidden`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${item.label}\n${item.startDate} → ${item.endDate}\nStatus: ${item.status}`}
                  >
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

