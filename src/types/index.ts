// All data shapes used by the app. Each table in the database uses one of these.
// Every record has a unique text `id`. `isSample` marks demo data so it can be cleared safely.

export interface BaseRecord {
  id: string
  isSample?: boolean
  createdAt: string // ISO date-time
  updatedAt: string
}

export const PROJECT_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Delayed', 'Completed', 'Cancelled'] as const
export type ProjectStatus = (typeof PROJECT_STATUSES)[number]

export const ACTIVE_PROJECT_STATUSES = ['Planning', 'In Progress', 'On Hold', 'Delayed'] as const
export const ARCHIVED_PROJECT_STATUSES = ['Completed', 'Cancelled'] as const
export const isArchivedStatus = (status: string) => status === 'Completed' || status === 'Cancelled'

export const PRIORITIES = ['Low', 'Medium', 'High', 'Critical'] as const
export type Priority = (typeof PRIORITIES)[number]

export const PRODUCT_STAGES = [
  'Qual',
  'Sample',
  'PPAP',
  'PCN',
  'Safe Launch',
  'CMT',
  'OB conversion',
  'PN Setup',
] as const
export type ProductStageCategory = (typeof PRODUCT_STAGES)[number] | string

export const NON_NPI_CATEGORIES = ['DOE', 'Web Development', 'Process Improvement', 'Automation / Tooling', 'Ad-hoc Task', 'Others'] as const
export type NonNpiCategory = (typeof NON_NPI_CATEGORIES)[number] | string

export const PROGRESS_STEPS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const

export const STAGE_STATUSES = ['Not Started', 'On Track', 'Watch', 'Risk', 'Urgent', 'On Hold', 'Done', 'Cancelled'] as const
export type StageStatus = (typeof STAGE_STATUSES)[number]
export const isStageDone = (status: string) => status === 'Done' || status === 'Completed'

export const TASK_STATUSES = ['Not Started', 'In Progress', 'Under Review', 'On Hold', 'Completed', 'Cancelled'] as const
export const NON_NPI_TASK_STATUSES = ['Not Started', 'In Progress', 'On Hold', 'Completed', 'Cancelled'] as const
export type TaskStatus = (typeof TASK_STATUSES)[number] | (typeof NON_NPI_TASK_STATUSES)[number]

export const MILESTONE_STATUSES = ['Not Started', 'In Progress', 'Completed', 'Delayed'] as const
export type MilestoneStatus = (typeof MILESTONE_STATUSES)[number]

export interface Project extends BaseRecord {
  code: string // Project / Product ID (e.g. PM-101)
  name: string // Product Name (e.g. AXON-400)
  packageType: string // Package Type (e.g. 48-QFN-EP)
  isNonNpi?: boolean
  nonNpiCategory?: string
  description: string
  objectives: string
  priority: Priority
  status: ProjectStatus
  startDate: string // YYYY-MM-DD or ''
  baselineDate: string
  revisedDate: string
  actualDate: string
  progress: number // 0-100
  remarks: string
}

/** Represents a Product Stage sub-item (Qual, Sample, PPAP, PCN, Safe Launch, CMT, OB conversion, PN Setup) under a Product+Package project. */
export interface Workstream extends BaseRecord {
  projectId: string
  name: string
  category: ProductStageCategory
  status: StageStatus
  progress: number
  order?: number
  startDate: string
  targetDate: string
  actualDate: string
  remarks: string
}

export interface Task extends BaseRecord {
  projectId: string
  workstreamId: string // linked Product Stage (Workstream)
  name: string
  assignee: string
  startDate: string
  dueDate: string
  startTime?: string // HH:mm (24h)
  endTime?: string // HH:mm (24h)
  completionDate: string
  priority: Priority
  status: TaskStatus
  progress: number
  remarks: string
  actionable?: boolean // true = executable task; false = FYI/informational only
}

export interface Milestone extends BaseRecord {
  projectId: string
  workstreamId: string
  name: string
  description: string
  targetDate: string
  actualDate: string
  status: MilestoneStatus
  remarks: string
}

export interface ActivityLog extends BaseRecord {
  entity: string // e.g. "Product", "Stage", "Task"
  entityId: string
  projectId: string // '' if not tied to a project
  action: 'Created' | 'Updated' | 'Deleted' | 'Status Changed'
  message: string
}
