<<<<<<< HEAD
import { useEffect, useState } from 'react'
=======
import { useEffect, useMemo, useRef, useState } from 'react'
>>>>>>> dba7bc961e680282f161f1fba77b6ecc7d00de21
import { NON_NPI_TASK_STATUSES, PRIORITIES, TASK_STATUSES, type Project, type Task, type Workstream } from '@/types'
import { createTask, emptyTask, updateTask, type TaskInput } from '@/services/taskService'
import { useTable } from '@/hooks/useTable'
import { todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { AutoResizeTextarea, Button, Field, FormError, Input, LeftSlideDrawer, Modal, Select } from '@/components/ui'

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
  const dirtyRef = useRef(false)
  const saveCurrentTaskRef = useRef<(() => Promise<boolean>) | null>(null)

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
    }
  }, [task?.id, task?.updatedAt, open])

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
<<<<<<< HEAD
    <Body
      key={`${open ? 'open' : 'closed'}-${task?.id ?? 'new'}-${task?.updatedAt ?? ''}-${defaultProjectId ?? ''}-${defaultDueDate ?? ''}-${nonNpiOnly ? 'nonnpi' : 'all'}`}
      task={task}
      defaultProjectId={defaultProjectId}
      defaultDueDate={defaultDueDate}
      nonNpiOnly={nonNpiOnly}
      onDirtyChange={onDirtyChange}
      onClose={onClose}
    />
=======
    <>
      <Body
        key={`${open ? 'open' : 'closed'}-${activeTask?.id ?? 'new'}-${activeTask?.updatedAt ?? ''}-${defaultProjectId ?? ''}-${defaultDueDate ?? ''}-${nonNpiOnly ? 'nonnpi' : 'all'}`}
        task={activeTask}
        defaultProjectId={defaultProjectId}
        defaultDueDate={defaultDueDate}
        nonNpiOnly={nonNpiOnly}
        onClose={onClose}
        onDirtyChange={(dirty) => {
          dirtyRef.current = dirty
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
>>>>>>> dba7bc961e680282f161f1fba77b6ecc7d00de21
  )
  if (variant === 'drawer') {
    return (
      <LeftSlideDrawer open={open} onClose={handleClose} title={title}>
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
  onDirtyChange,
  onClose,
  onDirtyChange,
  registerSave,
}: {
  task?: Task
  defaultProjectId?: string
  defaultDueDate?: string
  nonNpiOnly?: boolean
  onDirtyChange?: (dirty: boolean) => void
  onClose: () => void
  onDirtyChange: (dirty: boolean) => void
  registerSave: (fn: () => Promise<boolean>) => void
}) {
  const projects = useTable<Project>('projects') ?? []
  const workstreams = useTable<Workstream>('workstreams') ?? []
<<<<<<< HEAD
  const [initialForm] = useState<TaskInput>(() => {
=======

  const initialForm = useMemo<TaskInput>(() => {
>>>>>>> dba7bc961e680282f161f1fba77b6ecc7d00de21
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
<<<<<<< HEAD
  })
  const [form, setForm] = useState<TaskInput>(initialForm)

  useEffect(() => {
    onDirtyChange?.(JSON.stringify(form) !== JSON.stringify(initialForm))
  }, [form, initialForm, onDirtyChange])
=======
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
>>>>>>> dba7bc961e680282f161f1fba77b6ecc7d00de21

  const diffMins = toMins(form.endTime) - toMins(form.startTime)
  const matchedPreset = DURATION_PRESETS.find((p) => p.value !== 'custom' && Number(p.value) === diffMins)?.value ?? 'custom'
  const [error, setError] = useState('')
  const set = <K extends keyof TaskInput>(k: K, v: TaskInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const selectedProject = projects.find((p) => p.id === form.projectId)
  const isNonNpiProject = !!nonNpiOnly || !!selectedProject?.isNonNpi
  const selectableProjects = nonNpiOnly ? projects.filter((p) => !!p.isNonNpi) : projects
  const statusOptions = isNonNpiProject ? NON_NPI_TASK_STATUSES : TASK_STATUSES

  function handleProjectChange(projectId: string) {
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

      <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 px-3.5 py-2">
        <div>
          <span className="block text-xs font-semibold text-slate-800">Actionable Task</span>
          <span className="block text-[11px] text-slate-500">
            {form.actionable !== false
              ? 'Ticked: Task can be executed'
              : 'Unticked: FYI of the day (informational note)'}
          </span>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={form.actionable !== false}
            onChange={(e) => set('actionable', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
          />
        </label>
      </div>

      <div className="grid sm:grid-cols-2 gap-2.5">
        <Field label={nonNpiOnly ? 'Side-Quest' : 'Product / Workstream'} required>
          <Select
            value={form.projectId}
            onChange={(e) => handleProjectChange(e.target.value)}
            options={[
              { value: '', label: nonNpiOnly ? 'Select Side-Quest…' : 'Select product…' },
              ...selectableProjects.map((p) => ({
                value: p.id,
                label: p.isNonNpi
                  ? `${p.code} – ${p.name}`
                  : `${p.name}${p.nickname ? ` (${p.nickname})` : ''}${p.packageType ? ` (${p.packageType})` : ''} [${p.code}]`,
              })),
            ]}
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
        <Field label="Start Date (Creation Date)">
          <Input type="date" value={form.startDate} disabled readOnly className="bg-slate-100 text-slate-500 cursor-not-allowed" />
        </Field>
        <Field label="Due Date">
          <Input type="date" value={form.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field label="Start Time">
          <Input
            type="time"
            value={form.startTime ?? '09:00'}
            onChange={(e) => {
              const nextStart = e.target.value
              const curDuration = Math.max(15, toMins(form.endTime) - toMins(form.startTime))
              setForm((f) => ({
                ...f,
                startTime: nextStart,
                endTime: matchedPreset !== 'custom' ? fromMins(toMins(nextStart) + curDuration) : f.endTime,
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
              const nextEnd = fromMins(toMins(form.startTime ?? '09:00') + Number(val))
              set('endTime', nextEnd)
            }}
            options={DURATION_PRESETS}
          />
        </Field>
        <Field label="End Time">
          <Input type="time" value={form.endTime ?? '10:00'} onChange={(e) => set('endTime', e.target.value)} />
        </Field>
        <Field label="Completion Date">
          <Input type="date" value={form.completionDate} onChange={(e) => set('completionDate', e.target.value)} />
        </Field>
      </div>
<<<<<<< HEAD
      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      {/* Actionable toggle */}
      <label className="flex items-center gap-2.5 cursor-pointer select-none group">
        <input
          type="checkbox"
          checked={form.actionable !== false}
          onChange={(e) => set('actionable', e.target.checked)}
          className="h-4 w-4 rounded border-slate-300 text-primary accent-blue-600 cursor-pointer"
        />
        <span className="text-sm font-medium text-slate-700 group-hover:text-primary transition-colors">
          Actionable
        </span>
        <span className="text-xs text-slate-400">
          {form.actionable !== false
            ? '✔ This task can be executed'
            : 'ℹ FYI only — not an executable action'}
        </span>
      </label>
=======
      <Field label="Remarks">
        <AutoResizeTextarea
          rows={2}
          value={form.remarks}
          onChange={(e) => set('remarks', e.target.value)}
          placeholder="Remarks or notes…"
        />
      </Field>
>>>>>>> dba7bc961e680282f161f1fba77b6ecc7d00de21
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={handleClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Task</Button>
      </div>
    </form>
  )
}
