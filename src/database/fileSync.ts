import { db, TABLE_NAMES } from './db'
import type { ActivityLog, Milestone, Project, Task, Workstream } from '@/types'

interface DbSnapshot {
  projects: Project[]
  workstreams: Workstream[]
  tasks: Task[]
  milestones: Milestone[]
  activityLogs: ActivityLog[]
}

let initialized = false
let isApplyingRemote = false
let flushTimer: ReturnType<typeof setTimeout> | null = null
let hasPendingFlush = false

async function readLocalSnapshot(): Promise<DbSnapshot> {
  const [projects, workstreams, tasks, milestones, activityLogs] = await Promise.all([
    db.projects.toArray(),
    db.workstreams.toArray(),
    db.tasks.toArray(),
    db.milestones.toArray(),
    db.activityLogs.toArray(),
  ])
  return { projects, workstreams, tasks, milestones, activityLogs }
}

function isEmptySnapshot(s: DbSnapshot): boolean {
  return (
    s.projects.length === 0 &&
    s.workstreams.length === 0 &&
    s.tasks.length === 0 &&
    s.milestones.length === 0 &&
    s.activityLogs.length === 0
  )
}

export async function flushToFile(keepalive = false): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  hasPendingFlush = false
  try {
    const snapshot = await readLocalSnapshot()
    await fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
      keepalive,
    })
  } catch {
    // Offline or standalone static preview without local server; IndexedDB still holds data.
  }
}

function scheduleFlush() {
  if (isApplyingRemote) return
  hasPendingFlush = true
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    void flushToFile()
  }, 150)
}

async function applyRemoteSnapshot(remote: DbSnapshot): Promise<void> {
  isApplyingRemote = true
  try {
    await db.transaction(
      'rw',
      [db.projects, db.workstreams, db.tasks, db.milestones, db.activityLogs],
      async () => {
        await Promise.all(TABLE_NAMES.map((t) => db[t].clear()))
        if (remote.projects.length) await db.projects.bulkPut(remote.projects)
        if (remote.workstreams.length) await db.workstreams.bulkPut(remote.workstreams)
        if (remote.tasks.length) await db.tasks.bulkPut(remote.tasks)
        if (remote.milestones.length) await db.milestones.bulkPut(remote.milestones)
        if (remote.activityLogs.length) await db.activityLogs.bulkPut(remote.activityLogs)
      },
    )
  } finally {
    isApplyingRemote = false
  }
}

export async function initFileSync(): Promise<void> {
  if (initialized) return
  if (import.meta.env.MODE === 'test' || typeof window === 'undefined') return
  initialized = true

  for (const tableName of TABLE_NAMES) {
    const table = db[tableName]
    table.hook('creating', () => {
      scheduleFlush()
    })
    table.hook('updating', () => {
      scheduleFlush()
    })
    table.hook('deleting', () => {
      scheduleFlush()
    })
  }

  window.addEventListener('beforeunload', () => {
    if (hasPendingFlush) {
      void flushToFile(true)
    }
  })

  try {
    const res = await fetch('/api/db', { cache: 'no-store' })
    if (!res.ok) return
    const remote = (await res.json()) as DbSnapshot
    if (!isEmptySnapshot(remote)) {
      await applyRemoteSnapshot(remote)
    } else {
      const local = await readLocalSnapshot()
      if (!isEmptySnapshot(local)) {
        await flushToFile()
      }
    }
  } catch {
    // If local API server isn't running, app continues working with browser IndexedDB.
  }
}
