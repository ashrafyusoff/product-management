import { useState } from 'react'
import { NON_NPI_TASK_STATUSES, PRIORITIES, TASK_STATUSES, type Project, type Task, type Workstream } from '@/types'
import { createTask, emptyTask, updateTask, type TaskInput } from '@/services/taskService'
import { useTable } from '@/hooks/useTable'
import { todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

// `defaultProjectId` pre-selects the project when adding from inside a project.
// `nonNpiOnly` restricts the project dropdown strictly to Non-NPI Work items (excluding HRS projects).
export function TaskForm({
  open,
  task,
  defaultProjectId,
  nonNpiOnly = false,
  onClose,
}: {
  open: boolean
  task?: Task
  defaultProjectId?: string
  nonNpiOnly?: boolean
  onClose: () => void
}) {
  return (
    <Modal open={open} onClose={onClose} title={task ? 'Edit Task' : 'Add Task'} wide>
      <Body
        key={`${open ? 'open' : 'closed'}-${task?.id ?? 'new'}-${task?.updatedAt ?? ''}-${defaultProjectId ?? ''}-${nonNpiOnly ? 'nonnpi' : 'all'}`}
        task={task}
        defaultProjectId={defaultProjectId}
        nonNpiOnly={nonNpiOnly}
        onClose={onClose}
      />
    </Modal>
  )
}

function Body({
  task,
  defaultProjectId,
  nonNpiOnly,
  onClose,
}: {
  task?: Task
  defaultProjectId?: string
  nonNpiOnly?: boolean
  onClose: () => void
}) {
  const projects = useTable<Project>('projects') ?? []
  const workstreams = useTable<Workstream>('workstreams') ?? []
  const [form, setForm] = useState<TaskInput>(() =>
    task
      ? { ...task, startDate: task.startDate || task.createdAt?.slice(0, 10) || todayStr() }
      : emptyTask(defaultProjectId),
  )
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

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const payload: TaskInput = {
        ...form,
        startDate: form.startDate || todayStr(),
        assignee: '',
      }
      if (task) await updateTask(task.id, payload)
      else await createTask(payload)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <Field label="Task Name" required><Input value={form.name} onChange={(e) => set('name', e.target.value)} /></Field>
      <div className="grid sm:grid-cols-2 gap-3">
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
                  : `${p.name}${p.packageType ? ` (${p.packageType})` : ''} [${p.code}]`,
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
          <Input type="time" value={form.startTime ?? '09:00'} onChange={(e) => set('startTime', e.target.value)} />
        </Field>
        <Field label="End Time">
          <Input type="time" value={form.endTime ?? '10:00'} onChange={(e) => set('endTime', e.target.value)} />
        </Field>
        <Field label="Completion Date">
          <Input type="date" value={form.completionDate} onChange={(e) => set('completionDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Task</Button>
      </div>
    </form>
  )
}
