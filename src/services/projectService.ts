import { db } from '@/database/db'
import { isArchivedStatus, type Project } from '@/types'
import { clampProgress, newId, nowIso, todayStr } from '@/utils/helpers'
import { ValidationError, checkDateOrder, requireText } from '@/utils/validation'
import { logActivity } from './activityService'

export type ProjectInput = Omit<Project, 'id' | 'createdAt' | 'updatedAt' | 'isSample'>

function validate(input: ProjectInput) {
  requireText(input.code, 'Project Code')
  requireText(input.name, 'Product Name')
  checkDateOrder(input.startDate, input.baselineDate, 'start date', 'target date')
  checkDateOrder(input.startDate, input.revisedDate, 'start date', 'revised completion date')
  checkDateOrder(input.startDate, input.actualDate, 'start date', 'actual completion date')
}

async function assertCodeUnique(code: string, ignoreId?: string) {
  const existing = await db.projects.where('code').equalsIgnoreCase(code.trim()).first()
  if (existing && existing.id !== ignoreId) throw new ValidationError(`Project Code "${code}" is already used.`)
}

export async function createProject(input: ProjectInput): Promise<string> {
  const startDate = input.startDate || todayStr()
  const normalized = { ...input, startDate }
  validate(normalized)
  const code = normalized.code.trim()
  await assertCodeUnique(code)
  const name = normalized.name.trim() || code
  const packageType = (normalized.packageType || '').trim()
  const now = nowIso()
  const id = newId()
  await db.transaction('rw', db.projects, db.activityLogs, async () => {
    await db.projects.add({
      ...normalized,
      code,
      name,
      packageType,
      progress: clampProgress(normalized.progress),
      id,
      createdAt: now,
      updatedAt: now,
    })
    await logActivity('Product', id, id, 'Created', `Product ${name}${packageType ? ` (${packageType})` : ''} [${code}] created`)
  })
  return id
}

export async function updateProject(id: string, input: ProjectInput) {
  validate(input)
  const code = input.code.trim()
  await assertCodeUnique(code, id)
  const old = await db.projects.get(id)
  if (!old) throw new ValidationError('Product no longer exists.')
  if (isArchivedStatus(old.status) && !isArchivedStatus(input.status)) {
    throw new ValidationError('Archived products cannot be returned to active status.')
  }
  const name = input.name.trim() || code
  const packageType = (input.packageType || '').trim()
  await db.transaction('rw', db.projects, db.activityLogs, async () => {
    await db.projects.update(id, {
      ...input,
      code,
      name,
      packageType,
      progress: clampProgress(input.progress),
      updatedAt: nowIso(),
    })
    if (old.status !== input.status) {
      await logActivity('Product', id, id, 'Status Changed', `Product ${name} status: ${old.status} → ${input.status}`)
    } else {
      await logActivity('Product', id, id, 'Updated', `Product ${name} updated`)
    }
  })
}

// Deleting a product also removes everything that belongs to it, so no orphan records remain.
export async function deleteProject(id: string) {
  const p = await db.projects.get(id)
  if (!p) return
  await db.transaction(
    'rw',
    [db.projects, db.workstreams, db.tasks, db.milestones, db.activityLogs],
    async () => {
      for (const t of [db.workstreams, db.tasks, db.milestones, db.activityLogs]) {
        await t.where('projectId').equals(id).delete()
      }
      await db.projects.delete(id)
      await logActivity('Product', id, '', 'Deleted', `Product ${p.code} (${p.name}) deleted`)
    },
  )
}

export const emptyProject = (): ProjectInput => ({
  code: '',
  name: '',
  packageType: '',
  description: '',
  objectives: '',
  priority: 'Medium',
  status: 'Planning',
  startDate: todayStr(),
  baselineDate: '',
  revisedDate: '',
  actualDate: '',
  progress: 0,
  remarks: '',
})
