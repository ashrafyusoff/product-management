import { useEffect, useMemo, useRef, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { NON_NPI_TASK_STATUSES, PRIORITIES, TASK_STATUSES, type Project, type Task, type Workstream } from '@/types'
import { createTask, deleteTask, emptyTask, updateTask, type TaskInput } from '@/services/taskService'
import { useTable } from '@/hooks/useTable'
import { TaskAttachments } from './TaskAttachments'
import { todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { AutoResizeTextarea, Button, Field, FormError, Input, LeftSlideDrawer, Modal, SearchableSelect, Select } from '@/components/ui'

// `defaultProjectId` pre-selects the project when adding from inside a project.
// `nonNpiOnly` restricts the project dropdown strictly to Side-Quest items.
const DURATION_PRESETS = [
  { value: '15', label: '15 min' },
  { value: '30', label: '30 min' },
  { value: '45', label: '45 min' },
  { value: '60', label: '1 hour' },
  { value: '90', label: '1.5 hours' },
  { value: '120', label: '2 hours' },
  { value: '180', label: '3 hours' },
  { value: '240', label: '4 hours' },
  { value: 'custom', label: 'Custom' },
]

function toMins(hhmm?: string): number {
  if (!hhmm || !/^\d{2}:\d{2}$/.test(hhmm)) return 9 * 60
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

function fromMins(mins: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, mins))
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`
}

export function TaskForm({
  open,
  task,
  defaultProjectId,
  defaultDueDate,
  nonNpiOnly = false,
  variant = 'modal',
  onDirtyChange,
  onClose,
}: {
  open: boolean
  task?: Task
  defaultProjectId?: string
  defaultDueDate?: string
  nonNpiOnly?: boolean
  variant?: 'modal' | 'drawer'
  onDirtyChange?: (dirty: boolean) => void
  onClose: () => void
}) {
  const [activeTask, setActiveTask] = useState<Task | undefined>(task)
  const [pendingTask, setPendingTask] = useState<Task | undefined>()
  const [showPrompt, setShowPrompt] = useState(false)
  const [showProductTasks, setShowProductTasks] = useState(false)
  const [currentProjectId, setCurrentProjectId] = useState<string>(task?.projectId || defaultProjectId || '')
  const dirtyRef = useRef(false)
  const saveCurrentTaskRef = useRef<(() => Promise<boolean>) | null>(null)
  const allTasks = useTable<Task>('tasks') ?? []
  const allWorkstreams = useTable<Workstream>('workstreams') ?? []
  const allProjects = useTable<Project>('projects') ?? []

  useEffect(() => {
    if (!open) {
      setActiveTask(task)
      setPendingTask(undefined)
      setShowPrompt(false)
      dirtyRef.current = false
      return
    }
    // If open and task prop changed to a different task
    if (task && activeTask && task.id !== activeTask.id) {
      if (dirtyRef.current) {
        setPendingTask(task)
        setShowPrompt(true)
      } else {
        setActiveTask(task)
      }
    } else if (!activeTask && task) {
      setActiveTask(task)
    } else if (task && activeTask && task.id === activeTask.id && task.updatedAt !== activeTask.updatedAt && !dirtyRef.current) {
      setActiveTask(task)
    } else if (!task && activeTask) {
      setActiveTask(undefined)
    }
  }, [task?.id, task?.updatedAt, open])

  useEffect(() => {
    setCurrentProjectId(activeTask?.projectId || defaultProjectId || '')
  }, [activeTask?.id, activeTask?.projectId, defaultProjectId, open])

  const requestSwitchTask = (nextTask: Task) => {
    if (activeTask && nextTask.id === activeTask.id) return
    if (dirtyRef.current) {
      setPendingTask(nextTask)
      setShowPrompt(true)
    } else {
      setActiveTask(nextTask)
    }
  }

  const productTasksByStage = useMemo(() => {
    if (!currentProjectId) return []
    const projTasks = allTasks.filter((t) => t.projectId === currentProjectId && t.status !== 'Cancelled')
    const projWs = allWorkstreams.filter((w) => w.projectId === currentProjectId)
    const wsMap = new Map(projWs.map((w) => [w.id, w]))
    const groups = new Map<string, { stageLabel: string; tasks: Task[] }>()
    for (const t of projTasks) {
      const ws = t.workstreamId ? wsMap.get(t.workstreamId) : undefined
      const key = ws ? ws.id : '__none__'
      const stageLabel = ws ? (ws.name && ws.name !== ws.category ? `${ws.category}: ${ws.name}` : ws.category) : 'No Stage / General'
      const bucket = groups.get(key) ?? { stageLabel, tasks: [] }
      bucket.tasks.push(t)
      groups.set(key, bucket)
    }
    return Array.from(groups.values())
  }, [allTasks, allWorkstreams, currentProjectId])

  const currentProjectName = useMemo(() => {
    const p = allProjects.find((x) => x.id === currentProjectId)
    if (!p) return ''
    return p.nickname || p.name || p.code
  }, [allProjects, currentProjectId])

  const handleDelete = async () => {
    if (!activeTask) return
    if (!window.confirm(`Delete task "${activeTask.name}"?`)) return
    await deleteTask(activeTask.id)
    dirtyRef.current = false
    onClose()
  }

  useEffect(() => {
    if (!open || !activeTask || showPrompt) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Delete') return
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return
      e.preventDefault()
      void handleDelete()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, activeTask?.id, showPrompt])

  const handleClose = () => {
    if (dirtyRef.current) {
      if (window.confirm(`Discard unsaved changes to "${activeTask?.name || 'this task'}"?`)) {
        dirtyRef.current = false
        onClose()
      }
    } else {
      onClose()
    }
  }

  const title = activeTask ? 'Edit Task' : 'Add Task'
  const content = (
    <>
      <Body
        key={`${open ? 'open' : 'closed'}-${activeTask?.id ?? 'new'}-${activeTask?.updatedAt ?? ''}-${defaultProjectId ?? ''}-${defaultDueDate ?? ''}-${nonNpiOnly ? 'nonnpi' : 'all'}`}
        task={activeTask}
        defaultProjectId={defaultProjectId}
        defaultDueDate={defaultDueDate}
        nonNpiOnly={nonNpiOnly}
        onClose={onClose}
        onCancel={handleClose}
        onDelete={activeTask ? handleDelete : undefined}
        onProjectChange={setCurrentProjectId}
        showProductTasks={showProductTasks}
        onToggleProductTasks={() => setShowProductTasks((v) => !v)}
        productTaskCount={productTasksByStage.reduce((acc, g) => acc + g.tasks.length, 0)}
        onDirtyChange={(dirty) => {
          dirtyRef.current = dirty
          onDirtyChange?.(dirty)
        }}
        registerSave={(fn) => {
          saveCurrentTaskRef.current = fn
        }}
      />
      <Modal open={showPrompt} onClose={() => setShowPrompt(false)} title="Unsaved Changes" compact>
        <div className="space-y-3">
          <p className="text-sm text-slate-700">
            You have unsaved changes on <b>"{activeTask?.name || 'this task'}"</b>.
          </p>
          <p className="text-xs text-slate-500">
            Do you want to save before opening <b>"{pendingTask?.name || 'another task'}"</b>?
          </p>
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setPendingTask(undefined)
                setShowPrompt(false)
              }}
            >
              Keep Editing
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                if (pendingTask) {
                  setActiveTask(pendingTask)
                  setPendingTask(undefined)
                }
                dirtyRef.current = false
                setShowPrompt(false)
              }}
            >
              Discard & Open
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={async () => {
                if (saveCurrentTaskRef.current) {
                  const ok = await saveCurrentTaskRef.current()
                  if (ok) {
                    if (pendingTask) {
                      setActiveTask(pendingTask)
                      setPendingTask(undefined)
                    }
                    dirtyRef.current = false
                    setShowPrompt(false)
                  }
                }
              }}
            >
              Save & Open
            </Button>
          </div>
        </div>
      </Modal>
    </>
  )
  const sidePanel = showProductTasks ? (
    <aside className="w-[290px] max-w-[42vw] bg-white border border-slate-200 shadow-2xl flex flex-col rounded-2xl overflow-hidden shrink-0">
      <div className="flex h-14 items-center justify-between px-3.5 border-b border-slate-100 bg-slate-50/80 shrink-0">
        <div className="min-w-0">
          <h3 className="text-xs font-bold text-slate-800 truncate">
            {currentProjectName ? `${currentProjectName} Tasks` : 'Product Tasks'}
          </h3>
          <p className="text-[10px] text-slate-500">Categorized by Product Stage</p>
        </div>
        <button
          type="button"
          onClick={() => setShowProductTasks(false)}
          className="px-2 py-1 rounded-full text-[11px] font-medium text-slate-600 hover:bg-slate-200/70"
          title="Collapse list"
        >
          ‹ Hide
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-2.5 space-y-3">
        {!currentProjectId ? (
          <p className="text-xs text-slate-400 italic p-2">Select a product/workstream to view its tasks.</p>
        ) : productTasksByStage.length === 0 ? (
          <p className="text-xs text-slate-400 italic p-2">No tasks under this product yet.</p>
        ) : (
          productTasksByStage.map((group) => (
            <div key={group.stageLabel} className="space-y-1">
              <div className="px-1.5 py-0.5 text-[11px] font-bold text-slate-600 bg-slate-100 rounded flex items-center justify-between">
                <span className="truncate">{group.stageLabel}</span>
                <span className="text-[10px] font-semibold text-slate-500 shrink-0 ml-1">{group.tasks.length}</span>
              </div>
              <div className="space-y-1">
                {group.tasks.map((pt) => {
                  const isCurrent = activeTask?.id === pt.id
                  return (
                    <button
                      key={pt.id}
                      type="button"
                      onClick={() => requestSwitchTask(pt)}
                      className={`w-full text-left rounded-lg border px-2 py-1.5 text-xs transition-all ${
                        isCurrent
                          ? 'border-primary bg-primary/5 ring-1 ring-primary'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className={`font-semibold leading-tight break-words ${pt.status === 'Completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                          {pt.name}
                        </span>
                        {isCurrent && <span className="text-[9px] font-bold text-primary shrink-0">Editing</span>}
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5 mt-1 text-[10px] text-slate-500">
                        <span className="font-medium">{pt.status}</span>
                        <span>·</span>
                        <span>{pt.priority}</span>
                        {pt.dueDate && (
                          <>
                            <span>·</span>
                            <span>{pt.dueDate}</span>
                          </>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </aside>
  ) : null

  if (variant === 'drawer') {
    return (
      <LeftSlideDrawer open={open} onClose={handleClose} title={title} sidePanel={sidePanel}>
        {open ? content : null}
      </LeftSlideDrawer>
    )
  }
  return (
    <Modal open={open} onClose={handleClose} title={title} compact>
      {content}
    </Modal>
  )
}

function Body({
  task,
  defaultProjectId,
  defaultDueDate,
  nonNpiOnly,
  onClose,
  onCancel,
  onDelete,
  onProjectChange,
  showProductTasks,
  onToggleProductTasks,
  productTaskCount,
  onDirtyChange,
  registerSave,
}: {
  task?: Task
  defaultProjectId?: string
  defaultDueDate?: string
  nonNpiOnly?: boolean
  onClose: () => void
  onCancel: () => void
  onDelete?: () => void
  onProjectChange?: (pid: string) => void
  showProductTasks?: boolean
  onToggleProductTasks?: () => void
  productTaskCount?: number
  onDirtyChange: (dirty: boolean) => void
  registerSave: (fn: () => Promise<boolean>) => void
}) {
  const projects = useTable<Project>('projects') ?? []
  const workstreams = useTable<Workstream>('workstreams') ?? []
  const [showScheduleDetails, setShowScheduleDetails] = useState(false)

  const initialForm = useMemo<TaskInput>(() => {
    if (task) {
      return {
        ...task,
        startDate: task.startDate || task.createdAt?.slice(0, 10) || todayStr(),
        actionable: task.actionable !== false,
      }
    }
    const base = emptyTask(defaultProjectId)
    if (defaultDueDate) base.dueDate = defaultDueDate
    return base
  }, [task, defaultProjectId, defaultDueDate])

  const [form, setForm] = useState<TaskInput>(() => initialForm)

  const isDirty = useMemo(() => {
    return (
      form.name !== (initialForm.name || '') ||
      form.projectId !== (initialForm.projectId || '') ||
      form.workstreamId !== (initialForm.workstreamId || '') ||
      form.priority !== initialForm.priority ||
      form.status !== initialForm.status ||
      form.dueDate !== (initialForm.dueDate || '') ||
      form.startTime !== (initialForm.startTime || '') ||
      form.endTime !== (initialForm.endTime || '') ||
      form.completionDate !== (initialForm.completionDate || '') ||
      form.remarks !== (initialForm.remarks || '') ||
      (form.actionable !== false) !== (initialForm.actionable !== false)
    )
  }, [form, initialForm])

  useEffect(() => {
    onDirtyChange(isDirty)
  }, [isDirty, onDirtyChange])

  const diffMins = toMins(form.endTime) - toMins(form.startTime)
  const matchedPreset = DURATION_PRESETS.find((p) => p.value !== 'custom' && Number(p.value) === diffMins)?.value ?? 'custom'
  const [error, setError] = useState('')
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const selectedProject = projects.find((p) => p.id === form.projectId)
  const isNonNpiProject = !!nonNpiOnly || !!selectedProject?.isNonNpi
  const selectableProjects = nonNpiOnly ? projects.filter((p) => !!p.isNonNpi) : projects
  const statusOptions = isNonNpiProject ? NON_NPI_TASK_STATUSES : TASK_STATUSES

  function handleProjectChange(projectId: string) {
    onProjectChange?.(projectId)
    setForm((f) => ({
      ...f,
      projectId,
      workstreamId: '',
    }))
  }

  function handleStageChange(workstreamId: string) {
    setForm((f) => ({
      ...f,
      workstreamId,
    }))
  }

  const doSave = async (): Promise<boolean> => {
    setError('')
    try {
      const payload: TaskInput = {
        ...form,
        startDate: form.startDate || todayStr(),
        assignee: '',
        actionable: form.actionable !== false,
      }
      // Attachments are managed live by TaskAttachments; never overwrite them from the stale form copy.
      delete payload.attachments
      if (task) await updateTask(task.id, payload)
      else await createTask(payload)
      return true
    } catch (err) {
      setError(errorMessage(err))
      return false
    }
  }

  useEffect(() => {
    registerSave(doSave)
  })

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const ok = await doSave()
    if (ok) {
      onClose()
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2.5">
      <FormError message={error} />
      <Field label="Task Name" required>
        <AutoResizeTextarea
          rows={1}
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          placeholder="Task name…"
        />
      </Field>

      <div className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50/80 px-3 py-2">
        <label className="flex items-center gap-2 cursor-pointer min-w-0">
          <input
            type="checkbox"
            checked={form.actionable !== false}
            onChange={(e) => set('actionable', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer shrink-0"
          />
          <span className="min-w-0">
            <span className="block text-xs font-semibold text-slate-800 leading-tight">Actionable</span>
            <span className="block text-[10px] text-slate-500 truncate">
              {form.actionable !== false ? 'Executable task' : 'FYI only'}
            </span>
          </span>
        </label>
        {onToggleProductTasks && form.projectId && (
          <button
            type="button"
            onClick={onToggleProductTasks}
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold shrink-0 transition-colors ${
              showProductTasks
                ? 'bg-primary text-white border-primary'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {showProductTasks ? '‹ Hide Tasks' : `Same Product (${productTaskCount ?? 0}) ›`}
          </button>
        )}
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        <Field label={nonNpiOnly ? 'Side-Quest' : 'Product / Workstream'} required>
          <SearchableSelect
            value={form.projectId}
            onChange={(val) => handleProjectChange(val)}
            placeholder={nonNpiOnly ? 'Select Side-Quest…' : 'Select product…'}
            options={selectableProjects.map((p) => ({
              value: p.id,
              label: p.nickname || p.name || p.code,
            }))}
          />
        </Field>
        {!isNonNpiProject && (
          <Field label="Product Stage">
            <Select
              value={form.workstreamId}
              onChange={(e) => handleStageChange(e.target.value)}
              options={[
                { value: '', label: '— None —' },
                ...workstreams
                  .filter((w) => w.projectId === form.projectId)
                  .map((w) => ({ value: w.id, label: w.name && w.name !== w.category ? `${w.category}: ${w.name}` : w.category })),
              ]}
            />
          </Field>
        )}
        <Field label="Priority">
          <Select options={PRIORITIES} value={form.priority} onChange={(e) => set('priority', e.target.value as TaskInput['priority'])} />
        </Field>
        <Field label="Status">
          <Select
            options={statusOptions}
            value={statusOptions.includes(form.status as never) ? form.status : 'Not Started'}
            onChange={(e) => set('status', e.target.value as TaskInput['status'])}
          />
        </Field>
        <Field label="Due Date">
          <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
      </div>

      <div className="flex justify-end">
        <button
          type="button"
          onClick={() => setShowScheduleDetails((v) => !v)}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 hover:text-primary px-2 py-1 rounded-md hover:bg-slate-100 transition-colors"
        >
          {showScheduleDetails ? 'Hide Dates & Time ▴' : 'Start Date, Time & Completion ▾'}
        </button>
      </div>

      {showScheduleDetails && (
        <div className="grid sm:grid-cols-2 gap-2.5 rounded-xl border border-slate-200 bg-slate-50/70 p-2.5">
          <Field label="Start Date (Creation Date)">
            <Input type="date" value={form.startDate} disabled readOnly className="bg-slate-100 text-slate-500 cursor-not-allowed" />
          </Field>
          <Field label="Completion Date">
            <Input type="date" value={form.completionDate} onChange={(e) => set('completionDate', e.target.value)} />
          </Field>
          <Field label="Start Time">
            <Input
              type="time"
              value={form.startTime ?? ''}
              onChange={(e) => {
                const nextStart = e.target.value
                if (!nextStart) {
                  setForm((f) => ({ ...f, startTime: '', endTime: '' }))
                  return
                }
                const curDuration = Math.max(15, form.startTime && form.endTime ? toMins(form.endTime) - toMins(form.startTime) : 60)
                setForm((f) => ({
                  ...f,
                  startTime: nextStart,
                  endTime: matchedPreset !== 'custom' || !f.endTime ? fromMins(toMins(nextStart) + curDuration) : f.endTime,
                }))
              }}
            />
          </Field>
          <Field label="Duration">
            <Select
              value={matchedPreset}
              onChange={(e) => {
                const val = e.target.value
                if (val === 'custom') return
                const baseStart = form.startTime || '09:00'
                const nextEnd = fromMins(toMins(baseStart) + Number(val))
                setForm((f) => ({ ...f, startTime: baseStart, endTime: nextEnd }))
              }}
              options={DURATION_PRESETS}
            />
          </Field>
          <Field label="End Time">
            <Input type="time" value={form.endTime ?? ''} onChange={(e) => set('endTime', e.target.value)} />
          </Field>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 pt-1">
        {onDelete ? (
          <Button
            type="button"
            variant="danger"
            onClick={onDelete}
            title="Delete task (Del)"
          >
            <Trash2 className="h-3.5 w-3.5" /> Delete
          </Button>
        ) : <span />}
        <div className="flex items-center gap-2">
          <Button type="button" onClick={onCancel}>Cancel</Button>
          <Button type="submit" variant="primary">Save Task</Button>
        </div>
      </div>

      <Field label="Remarks">
        <AutoResizeTextarea
          rows={2}
          value={form.remarks}
          onChange={(e) => set('remarks', e.target.value)}
          placeholder="Remarks or notes…"
        />
      </Field>
      <TaskAttachments taskId={task?.id} />
    </form>
  )
}
