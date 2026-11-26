import { db } from '@/database/db'
import type { Task } from '@/types'
import { clampProgress, newId, nowIso, todayStr } from '@/utils/helpers'
import { ValidationError, checkDateOrder, requireText } from '@/utils/validation'
import { logActivity } from './activityService'
import { pushUndoSnapshot } from './undoService'

export type TaskInput = Omit<Task, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

function validate(i: TaskInput) {
  requireText(i.name, 'Task name')
  if (!i.projectId) throw new ValidationError('Please choose a project.')
  checkDateOrder(i.startDate, i.dueDate, 'start date', 'due date')
  checkDateOrder(i.startDate, i.completionDate, 'start date', 'completion date')
  if (i.startTime && i.endTime && i.endTime <= i.startTime) {
    throw new ValidationError('End time must be after start time.')
  }
}

// A completed task gets 100% and a completion date automatically.
function normalise(i: TaskInput): TaskInput {
  const out = {
    ...i,
    name: i.name.trim(),
    progress: clampProgress(i.progress),
    actionable: i.actionable !== false,
  }
  if (out.status === 'Completed') {
    out.progress = 100
    if (!out.completionDate) out.completionDate = todayStr()
  }
  return out
}

export async function createTask(input: TaskInput) {
  const withStart = { ...input, startDate: input.startDate || todayStr() }
  validate(withStart)
  const data = normalise(withStart)
  await pushUndoSnapshot(`Create task "${data.name}"`)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', [db.tasks, db.activityLogs], async () => {
    await db.tasks.add({ ...data, id, createdAt: now, updatedAt: now })
    await logActivity('Task', id, data.projectId, 'Created', `Task "${data.name}" created`)
  })
}

export async function updateTask(id: string, input: TaskInput) {
  validate(input)
  const data = normalise(input)
  const old = await db.tasks.get(id)
  if (!old) throw new ValidationError('Task no longer exists.')
  await pushUndoSnapshot(`Update task "${data.name}"`)
  await db.transaction('rw', [db.tasks, db.activityLogs], async () => {
    await db.tasks.update(id, { ...data, updatedAt: nowIso() })
    const changed = old.status !== data.status
    await logActivity('Task', id, data.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `Task "${data.name}" status: ${old.status} → ${data.status}` : `Task "${data.name}" updated`)
  })
}

export async function deleteTask(id: string) {
  const t = await db.tasks.get(id)
  if (!t) return
  await pushUndoSnapshot(`Delete task "${t.name}"`)
  await db.transaction('rw', [db.tasks, db.activityLogs], async () => {
    await db.tasks.delete(id)
    await logActivity('Task', id, t.projectId, 'Deleted', `Task "${t.name}" deleted`)
  })
}

export async function rescheduleTask(id: string, newDueDate: string, newStartTime?: string, newEndTime?: string) {
  const old = await db.tasks.get(id)
  if (!old) throw new ValidationError('Task no longer exists.')
  const timeChanged = (newStartTime !== undefined && newStartTime !== old.startTime) || (newEndTime !== undefined && newEndTime !== old.endTime)
  if (old.dueDate === newDueDate && !timeChanged) return
  await pushUndoSnapshot(`Move task "${old.name}"`)
  let startDate = old.startDate
  if (old.startDate && old.dueDate && old.dueDate !== newDueDate) {
    const delta = new Date(newDueDate).getTime() - new Date(old.dueDate).getTime()
    startDate = new Date(new Date(old.startDate).getTime() + delta).toISOString().slice(0, 10)
  } else if (old.startDate && newDueDate < old.startDate) {
    startDate = newDueDate
  }
  const patch: Partial<Task> = { dueDate: newDueDate, startDate, updatedAt: nowIso() }
  if (newStartTime !== undefined) patch.startTime = newStartTime
  if (newEndTime !== undefined) patch.endTime = newEndTime
  await db.transaction('rw', [db.tasks, db.activityLogs], async () => {
    await db.tasks.update(id, patch)
    const timeSuffix = newStartTime && newEndTime ? ` (${newStartTime}–${newEndTime})` : ''
    await logActivity('Task', id, old.projectId, 'Updated', `Task "${old.name}" rescheduled to ${newDueDate}${timeSuffix}`)
  })
}

export async function duplicateTaskToDate(id: string, newDueDate: string) {
  const old = await db.tasks.get(id)
  if (!old) throw new ValidationError('Task no longer exists.')
  await pushUndoSnapshot(`Copy task "${old.name}"`)
  let startDate = old.startDate
  if (old.startDate && old.dueDate) {
    const delta = new Date(newDueDate).getTime() - new Date(old.dueDate).getTime()
    startDate = new Date(new Date(old.startDate).getTime() + delta).toISOString().slice(0, 10)
  } else if (old.startDate && newDueDate < old.startDate) {
    startDate = newDueDate
  }
  const now = nowIso()
  const newTaskId = newId()
  const copyName = `${old.name} (Copy)`
  await db.transaction('rw', [db.tasks, db.activityLogs], async () => {
    await db.tasks.add({
      ...old,
      id: newTaskId,
      name: copyName,
      startDate,
      dueDate: newDueDate,
      completionDate: '',
      status: old.status === 'Completed' ? 'In Progress' : old.status,
      progress: old.status === 'Completed' ? 0 : old.progress,
      isSample: false,
      createdAt: now,
      updatedAt: now,
    })
    await logActivity('Task', newTaskId, old.projectId, 'Created', `Task "${copyName}" copied to ${newDueDate}`)
  })
}

export async function updateTasksPriority(ids: string[], priority: Task['priority']) {
  if (ids.length === 0) return
  await pushUndoSnapshot(`Set priority to ${priority}`)
  const now = nowIso()
  await db.transaction('rw', [db.tasks, db.activityLogs], async () => {
    for (const id of ids) {
      const old = await db.tasks.get(id)
      if (!old || old.priority === priority) continue
      await db.tasks.update(id, { priority, updatedAt: now })
      await logActivity('Task', id, old.projectId, 'Updated', `Task "${old.name}" priority: ${old.priority} → ${priority}`)
    }
  })
}

export async function updateTasksStatus(ids: string[], status: Task['status']) {
  if (ids.length === 0) return
  await pushUndoSnapshot(`Mark ${ids.length} task(s) ${status}`)
  const now = nowIso()
  await db.transaction('rw', [db.tasks, db.activityLogs], async () => {
    for (const id of ids) {
      const old = await db.tasks.get(id)
      if (!old || old.status === status) continue
      const patch: Partial<Task> = { status, updatedAt: now }
      if (status === 'Completed') {
        patch.progress = 100
        if (!old.completionDate) patch.completionDate = todayStr()
      }
      await db.tasks.update(id, patch)
      await logActivity('Task', id, old.projectId, 'Status Changed', `Task "${old.name}" status: ${old.status} → ${status}`)
    }
  })
}

export const emptyTask = (projectId = ''): TaskInput => ({
  projectId, workstreamId: '', name: '', assignee: '', startDate: todayStr(), dueDate: '',
  startTime: '09:00', endTime: '10:00', completionDate: '',
<<<<<<< HEAD
  priority: 'Medium', status: 'Not Started', progress: 0, remarks: '', actionable: true,
=======
  priority: 'Medium', status: 'Not Started', progress: 0, remarks: '',
  actionable: true,
>>>>>>> dba7bc961e680282f161f1fba77b6ecc7d00de21
})
