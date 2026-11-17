import Dexie, { type EntityTable } from 'dexie'
import type { ActivityLog, Milestone, Project, Task, Workstream } from '@/types'

// The local browser database. Each property below is one table.
export class ProductDatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>
  workstreams!: EntityTable<Workstream, 'id'>
  tasks!: EntityTable<Task, 'id'>
  milestones!: EntityTable<Milestone, 'id'>
  activityLogs!: EntityTable<ActivityLog, 'id'>

  constructor() {
    super('npi-project-manager')
    this.version(1).stores({
      projects: 'id, &code, status, priority',
      workstreams: 'id, projectId, supplierId',
      suppliers: 'id, &name',
      projectSuppliers: 'id, &[projectId+supplierId], projectId, supplierId',
      tasks: 'id, projectId, workstreamId, supplierId, status, dueDate',
      milestones: 'id, projectId, workstreamId, targetDate',
      quotations: 'id, projectId, supplierId',
      petRecords: 'id, projectId, supplierId',
      prRecords: 'id, projectId, supplierId',
      poRecords: 'id, projectId, supplierId',
      meetings: 'id, projectId',
      meetingActions: 'id, meetingId, taskId',
      risks: 'id, projectId',
      issues: 'id, projectId, workstreamId',
      activityLogs: 'id, projectId, createdAt',
    })
    this.version(2).stores({
      quotations: 'id, projectId, workstreamId, supplierId',
      petRecords: 'id, projectId, workstreamId, supplierId',
      poRecords: 'id, projectId, workstreamId, supplierId',
    })
    this.version(3).stores({
      projects: 'id, &code, status, priority',
      workstreams: 'id, projectId, category',
      tasks: 'id, projectId, workstreamId, status, dueDate',
      milestones: 'id, projectId, workstreamId, targetDate',
      activityLogs: 'id, projectId, createdAt',
      suppliers: null,
      projectSuppliers: null,
      quotations: null,
      petRecords: null,
      prRecords: null,
      poRecords: null,
      meetings: null,
      meetingActions: null,
      risks: null,
      issues: null,
    })
  }
}

export const db = new ProductDatabase()

// One list of every active table name, used by backup / reset / export code.
export const TABLE_NAMES = ['projects', 'workstreams', 'tasks', 'milestones', 'activityLogs'] as const
export type TableName = (typeof TABLE_NAMES)[number]
