import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from '@/database/db'
import { createProject, deleteProject, emptyProject, updateProject } from './projectService'
import { createWorkstream, deleteWorkstream, emptyWorkstream, moveWorkstreamOrder, sortWorkstreams } from './workstreamService'
import { createTask, emptyTask } from './taskService'
import { createMilestone, emptyMilestone } from './milestoneService'
import { buildBackup, resetAllData, restoreBackup, validateBackup } from './backupService'
import { REPORT_NAMES, buildSheets } from './exportService'
import { clearSampleData, hasSampleData, loadSampleData } from './sampleData'

beforeEach(async () => {
  await resetAllData()
})

describe('Product Management — Database & Service Suite', () => {
  it('creates, updates, validates, and cascades product deletion safely', async () => {
    await expect(createProject({ ...emptyProject(), code: '   ', name: 'AXON-400' })).rejects.toThrow(/Project Code/i)
    await expect(createProject({ ...emptyProject(), code: 'PM-101', name: '' })).rejects.toThrow(/Product Name/i)

    const pId = await createProject({
      ...emptyProject(),
      code: 'PM-101',
      name: 'AXON-400',
      packageType: '48-QFN-EP',
      startDate: '2026-01-10',
      baselineDate: '2026-06-01',
    })
    await expect(createProject({ ...emptyProject(), code: 'pm-101', name: 'Dup' })).rejects.toThrow(/already used/i)

    await updateProject(pId, {
      ...emptyProject(),
      code: 'PM-101',
      name: 'AXON-400',
      packageType: '48-QFN-EP',
      status: 'In Progress',
      progress: 40,
      startDate: '2026-01-10',
      baselineDate: '2026-06-01',
    })
    expect((await db.projects.get(pId))?.status).toBe('In Progress')

    const sId = await createWorkstream({ ...emptyWorkstream(pId), category: 'Qual', status: 'On Track' })
    await createTask({ ...emptyTask(pId), workstreamId: sId, name: 'Close review board action items', startDate: '2026-02-01', dueDate: '2026-03-01' })
    await createMilestone({ ...emptyMilestone(pId), workstreamId: sId, name: 'Qual Gate', targetDate: '2026-04-01' })

    await deleteProject(pId)
    expect(await db.projects.count()).toBe(0)
    expect(await db.workstreams.count()).toBe(0)
    expect(await db.tasks.count()).toBe(0)
    expect(await db.milestones.count()).toBe(0)
  })

  it('manages multi-stage product workstreams, reordering, and detaches tasks on stage deletion', async () => {
    const pId = await createProject({ ...emptyProject(), code: 'PM-102', name: 'VECTRA-M7', packageType: '144-BGA-TP' })
    const s1 = await createWorkstream({ ...emptyWorkstream(pId), category: 'Qual', status: 'On Track' })
    const s2 = await createWorkstream({ ...emptyWorkstream(pId), category: 'PCN', status: 'Urgent' })
    const s3 = await createWorkstream({ ...emptyWorkstream(pId), category: 'PN Setup', status: 'Done' })

    expect((await db.workstreams.get(s3))?.progress).toBe(100)
    expect(await db.workstreams.where('projectId').equals(pId).count()).toBe(3)

    // Reorder s3 up above s2
    await moveWorkstreamOrder(pId, s3, 'up')
    const ordered = sortWorkstreams(await db.workstreams.where('projectId').equals(pId).toArray())
    expect(ordered.map((w) => w.id)).toEqual([s1, s3, s2])

    await createTask({ ...emptyTask(pId), workstreamId: s1, name: 'Reliability stress check' })
    await deleteWorkstream(s1)
    expect(await db.workstreams.where('projectId').equals(pId).count()).toBe(2)
    expect((await db.tasks.toArray())[0].workstreamId).toBe('')
  })

  it('loads sample data, clears only sample data while preserving user records, and validates backup & Excel sheets', async () => {
    await loadSampleData()
    expect(await hasSampleData()).toBe(true)
    const sampleCount = await db.projects.count()
    expect(sampleCount).toBeGreaterThan(5)

    // Add a user-created product alongside sample data
    const userProjId = await createProject({ ...emptyProject(), code: 'USER-01', name: 'KRYPTON-9', packageType: '64-QFN' })
    expect(await db.projects.count()).toBe(sampleCount + 1)

    // Test Excel sheet builders for all report types
    for (const r of REPORT_NAMES) {
      const sheets = await buildSheets(r)
      expect(Object.keys(sheets).length).toBeGreaterThan(0)
    }

    // Clear sample data — user-created product must survive
    await clearSampleData()
    expect(await hasSampleData()).toBe(false)
    expect(await db.projects.count()).toBe(1)
    expect(await db.projects.get(userProjId)).toBeDefined()

    // JSON backup & restore round-trip
    const backup = validateBackup(JSON.parse(JSON.stringify(await buildBackup())))
    await resetAllData()
    expect(await db.projects.count()).toBe(0)
    await restoreBackup(backup)
    expect(await db.projects.count()).toBe(1)
    expect((await db.projects.get(userProjId))?.name).toBe('KRYPTON-9')
  })
})
