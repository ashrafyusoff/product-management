import { db } from '@/database/db'
import { isStageDone, type Workstream } from '@/types'
import { clampProgress, newId, nowIso } from '@/utils/helpers'
import { ValidationError, checkDateOrder, requireText } from '@/utils/validation'
import { logActivity } from './activityService'

export type WorkstreamInput = Omit<Workstream, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

export function sortWorkstreams(list: Workstream[]): Workstream[] {
  return [...list].sort(
    (a, b) => (a.order ?? Number.MAX_SAFE_INTEGER) - (b.order ?? Number.MAX_SAFE_INTEGER) || a.createdAt.localeCompare(b.createdAt),
  )
}

function validate(i: WorkstreamInput) {
  requireText(i.category || i.name, 'Stage Category')
  checkDateOrder(i.startDate, i.targetDate, 'start date', 'target completion date')
  checkDateOrder(i.startDate, i.actualDate, 'start date', 'actual completion date')
}

function normalise(input: WorkstreamInput): WorkstreamInput {
  const category = (input.category || 'Qual').trim()
  const name = category
  const progress = isStageDone(input.status) ? 100 : clampProgress(input.progress)
  return { ...input, category, name, progress }
}

export async function createWorkstream(input: WorkstreamInput) {
  validate(input)
  const data = normalise(input)
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', db.workstreams, db.activityLogs, async () => {
    const existing = await db.workstreams.where('projectId').equals(data.projectId).toArray()
    const maxOrder = existing.reduce((m, w) => Math.max(m, w.order ?? -1), -1)
    await db.workstreams.add({ ...data, order: data.order ?? maxOrder + 1, id, createdAt: now, updatedAt: now })
    await logActivity('Stage', id, data.projectId, 'Created', `Stage "${data.category}" created`)
  })
  return id
}

export async function updateWorkstream(id: string, input: WorkstreamInput) {
  validate(input)
  const old = await db.workstreams.get(id)
  if (!old) throw new ValidationError('Stage no longer exists.')
  const data = normalise(input)
  await db.transaction('rw', db.workstreams, db.activityLogs, async () => {
    await db.workstreams.update(id, { ...data, order: data.order ?? old.order, updatedAt: nowIso() })
    const changed = old.status !== data.status
    await logActivity(
      'Stage',
      id,
      data.projectId,
      changed ? 'Status Changed' : 'Updated',
      changed ? `Stage "${data.category}" status: ${old.status} → ${data.status}` : `Stage "${data.category}" updated`,
    )
  })
}

export async function moveWorkstreamOrder(projectId: string, workstreamId: string, direction: 'up' | 'down') {
  await db.transaction('rw', db.workstreams, async () => {
    const ordered = sortWorkstreams(await db.workstreams.where('projectId').equals(projectId).toArray())
    const idx = ordered.findIndex((w) => w.id === workstreamId)
    if (idx === -1) return
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    if (targetIdx < 0 || targetIdx >= ordered.length) return
    const swapped = [...ordered]
    ;[swapped[idx], swapped[targetIdx]] = [swapped[targetIdx], swapped[idx]]
    const now = nowIso()
    await Promise.all(
      swapped.map((w, i) =>
        db.workstreams.update(w.id, { order: i, updatedAt: w.id === workstreamId || w.id === ordered[targetIdx].id ? now : w.updatedAt }),
      ),
    )
  })
}

export async function deleteWorkstream(id: string) {
  const w = await db.workstreams.get(id)
  if (!w) return
  await db.transaction('rw', [db.workstreams, db.tasks, db.milestones, db.activityLogs], async () => {
    await db.tasks.where('workstreamId').equals(id).modify({ workstreamId: '' })
    await db.milestones.where('workstreamId').equals(id).modify({ workstreamId: '' })
    await db.workstreams.delete(id)
    await logActivity('Stage', id, w.projectId, 'Deleted', `Stage "${w.category}" deleted`)
  })
}

export const emptyWorkstream = (projectId: string): WorkstreamInput => ({
  projectId,
  name: 'Qual',
  category: 'Qual',
  status: 'Not Started',
  progress: 0,
  startDate: '',
  targetDate: '',
  actualDate: '',
  remarks: '',
})
