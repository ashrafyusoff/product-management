import { db } from '@/database/db'
import type { TaskAttachment } from '@/types'
import { nowIso } from '@/utils/helpers'

// Attachment files are stored by the local server under data/attachments/<id>/<filename>.
// Tasks only keep lightweight metadata (TaskAttachment[]), so db.json stays small.

export const attachmentUrl = (att: TaskAttachment, download = false) =>
  `/api/attachments/${att.id}${download ? '?download=1' : ''}`

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1048576).toFixed(1)} MB`
}

export async function uploadAttachment(
  file: Blob,
  name: string,
  source: TaskAttachment['source'] = 'upload',
): Promise<TaskAttachment> {
  const res = await fetch(`/api/attachments?name=${encodeURIComponent(name)}`, {
    method: 'POST',
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    body: file,
  })
  if (!res.ok) {
    let msg = `Upload failed (${res.status})`
    try {
      const j = (await res.json()) as { error?: string }
      if (j.error) msg = j.error
    } catch {
      // ignore
    }
    throw new Error(`${msg}. Make sure the local server is running (npm run dev / npm start).`)
  }
  const meta = (await res.json()) as { id: string; name: string; size: number; type: string }
  return { ...meta, addedAt: nowIso(), source }
}

export async function addAttachmentsToTask(taskId: string, atts: TaskAttachment[]) {
  if (atts.length === 0) return
  const t = await db.tasks.get(taskId)
  if (!t) return
  await db.tasks.update(taskId, { attachments: [...(t.attachments ?? []), ...atts], updatedAt: nowIso() })
}

export async function attachFilesToTask(taskId: string, files: File[]) {
  const uploaded: TaskAttachment[] = []
  for (const f of files) uploaded.push(await uploadAttachment(f, f.name))
  await addAttachmentsToTask(taskId, uploaded)
  return uploaded
}

export async function removeAttachmentFromTask(taskId: string, attId: string) {
  const t = await db.tasks.get(taskId)
  if (!t) return
  await db.tasks.update(taskId, {
    attachments: (t.attachments ?? []).filter((a) => a.id !== attId),
    updatedAt: nowIso(),
  })
  // Copied tasks share the same attachment files; only delete the file when no task references it.
  const stillUsed = (await db.tasks.toArray()).some(
    (x) => x.id !== taskId && (x.attachments ?? []).some((a) => a.id === attId),
  )
  if (!stillUsed) {
    await fetch(`/api/attachments/${attId}`, { method: 'DELETE' }).catch(() => undefined)
  }
}
