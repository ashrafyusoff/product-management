import { db } from '@/database/db'
import type { Milestone } from '@/types'
import { newId, nowIso, todayStr } from '@/utils/helpers'
import { ValidationError, requireText } from '@/utils/validation'
import { logActivity } from './activityService'
import { pushUndoSnapshot } from './undoService'

export type MilestoneInput = Omit<Milestone, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

function validate(i: MilestoneInput) {
  requireText(i.name, 'Milestone name')
  if (!i.projectId) throw new ValidationError('Please choose a project.')
  if (!i.targetDate) throw new ValidationError('Target date is required.')
}

function normalise(i: MilestoneInput): MilestoneInput {
  const out = { ...i, name: i.name.trim() }
  if (out.status === 'Completed' && !out.actualDate) out.actualDate = todayStr()
  return out
}

export async function createMilestone(input: MilestoneInput) {
  validate(input)
  const data = normalise(input)
  await pushUndoSnapshot(`Create milestone "${data.name}"`)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', [db.milestones, db.activityLogs], async () => {
    await db.milestones.add({ ...data, id, createdAt: now, updatedAt: now })
    await logActivity('Milestone', id, data.projectId, 'Created', `Milestone "${data.name}" created`)
  })
}

export async function updateMilestone(id: string, input: MilestoneInput) {
  validate(input)
  const data = normalise(input)
  const old = await db.milestones.get(id)
  if (!old) throw new ValidationError('Milestone no longer exists.')
  await pushUndoSnapshot(`Update milestone "${data.name}"`)
  await db.transaction('rw', [db.milestones, db.activityLogs], async () => {
    await db.milestones.update(id, { ...data, updatedAt: nowIso() })
    const changed = old.status !== data.status
    await logActivity('Milestone', id, data.projectId, changed ? 'Status Changed' : 'Updated',
      changed ? `Milestone "${data.name}" status: ${old.status} → ${data.status}` : `Milestone "${data.name}" updated`)
  })
}

export async function deleteMilestone(id: string) {
  const m = await db.milestones.get(id)
  if (!m) return
  await pushUndoSnapshot(`Delete milestone "${m.name}"`)
  await db.transaction('rw', [db.milestones, db.activityLogs], async () => {
    await db.milestones.delete(id)
    await logActivity('Milestone', id, m.projectId, 'Deleted', `Milestone "${m.name}" deleted`)
  })
}

export async function rescheduleMilestone(id: string, newTargetDate: string) {
  const old = await db.milestones.get(id)
  if (!old) throw new ValidationError('Milestone no longer exists.')
  if (old.targetDate === newTargetDate) return
  await pushUndoSnapshot(`Move milestone "${old.name}"`)
  await db.transaction('rw', [db.milestones, db.activityLogs], async () => {
    await db.milestones.update(id, { targetDate: newTargetDate, updatedAt: nowIso() })
    await logActivity('Milestone', id, old.projectId, 'Updated', `Milestone "${old.name}" moved to ${newTargetDate}`)
  })
}

export async function duplicateMilestoneToDate(id: string, newTargetDate: string) {
  const old = await db.milestones.get(id)
  if (!old) throw new ValidationError('Milestone no longer exists.')
  const now = nowIso()
  const newMsId = newId()
  const copyName = `${old.name} (Copy)`
  await db.transaction('rw', [db.milestones, db.activityLogs], async () => {
    await db.milestones.add({
      ...old,
      id: newMsId,
      name: copyName,
      targetDate: newTargetDate,
      actualDate: '',
      status: old.status === 'Completed' ? 'Not Started' : old.status,
      isSample: false,
      createdAt: now,
      updatedAt: now,
    })
    await logActivity('Milestone', newMsId, old.projectId, 'Created', `Milestone "${copyName}" copied to ${newTargetDate}`)
  })
}

export const emptyMilestone = (projectId = ''): MilestoneInput => ({
  projectId, workstreamId: '', name: '', description: '', targetDate: '', actualDate: '', status: 'Not Started', remarks: '',
})
