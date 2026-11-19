import { TABLE_NAMES, db, type TableName } from '@/database/db'

interface UndoEntry {
  label: string
  snapshot: Record<TableName, unknown[]>
}

const MAX_UNDO = 25
const undoStack: UndoEntry[] = []

export async function pushUndoSnapshot(label: string) {
  const snapshot = {} as Record<TableName, unknown[]>
  for (const name of TABLE_NAMES) {
    snapshot[name] = await db[name].toArray()
  }
  undoStack.push({ label, snapshot })
  if (undoStack.length > MAX_UNDO) undoStack.shift()
}

export async function undoLastAction(): Promise<string | null> {
  const entry = undoStack.pop()
  if (!entry) return null
  await db.transaction('rw', db.tables, async () => {
    for (const name of TABLE_NAMES) {
      await db[name].clear()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (entry.snapshot[name].length > 0) await (db[name] as any).bulkAdd(entry.snapshot[name])
    }
  })
  return entry.label
}

export function getUndoCount(): number {
  return undoStack.length
}
