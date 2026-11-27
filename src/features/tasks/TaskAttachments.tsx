import { useRef, useState } from 'react'
import { Download, FileText, Loader2, Mail, Paperclip, X } from 'lucide-react'
import type { Task } from '@/types'
import { useTable } from '@/hooks/useTable'
import { attachFilesToTask, attachmentUrl, formatBytes, removeAttachmentFromTask } from '@/services/attachmentService'
import { cn } from '@/utils/helpers'

// Attachments panel for the Edit Task drawer: click or drag & drop files (incl. Outlook emails) to attach.
export function TaskAttachments({ taskId }: { taskId?: string }) {
  const tasks = useTable<Task>('tasks') ?? []
  const task = taskId ? tasks.find((t) => t.id === taskId) : undefined
  const atts = task?.attachments ?? []
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(list: FileList | File[] | null) {
    if (!taskId || !list) return
    const files = Array.from(list)
    if (files.length === 0) return
    setBusy(true)
    setErr('')
    try {
      await attachFilesToTask(taskId, files)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleRemove(attId: string, name: string) {
    if (!taskId) return
    if (!window.confirm(`Remove attachment "${name}"?`)) return
    await removeAttachmentFromTask(taskId, attId)
  }

  return (
    <div
      onDragOver={(e) => {
        if (!taskId) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'copy'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (!taskId) return
        e.preventDefault()
        e.stopPropagation()
        setDragOver(false)
        void handleFiles(e.dataTransfer.files)
      }}
      className={cn(
        'rounded-xl border border-dashed px-2.5 py-2 transition-colors',
        dragOver ? 'border-primary bg-primary/5' : 'border-slate-200 bg-slate-50/60',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-700">
          <Paperclip className="h-3.5 w-3.5" /> Attachments {atts.length > 0 && `(${atts.length})`}
        </span>
        {taskId && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Paperclip className="h-3 w-3" />} Attach
          </button>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            void handleFiles(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {!taskId ? (
        <p className="mt-1 text-[11px] text-slate-400 italic">Save the task first, then attach files.</p>
      ) : atts.length === 0 ? (
        <p className="mt-1 text-[11px] text-slate-400 italic">Drag files or Outlook emails here, or click Attach.</p>
      ) : (
        <ul className="mt-1.5 space-y-1">
          {atts.map((a) => {
            const isEmail = /\.(msg|eml)$/i.test(a.name)
            const Icon = isEmail ? Mail : FileText
            return (
              <li key={a.id} className="group flex items-center gap-1.5 rounded-lg bg-white border border-slate-200 px-2 py-1">
                <Icon className={cn('h-3.5 w-3.5 shrink-0', isEmail ? 'text-blue-600' : 'text-slate-500')} />
                <a
                  href={attachmentUrl(a)}
                  target="_blank"
                  rel="noreferrer"
                  title={`Open ${a.name}`}
                  className="min-w-0 flex-1 truncate text-xs font-medium text-slate-700 hover:text-primary hover:underline"
                >
                  {a.name}
                </a>
                <span className="text-[10px] text-slate-400 shrink-0">{formatBytes(a.size)}</span>
                <a
                  href={attachmentUrl(a, true)}
                  title="Download"
                  className="p-0.5 text-slate-400 hover:text-primary shrink-0"
                >
                  <Download className="h-3 w-3" />
                </a>
                <button
                  type="button"
                  onClick={() => void handleRemove(a.id, a.name)}
                  title="Remove attachment"
                  className="p-0.5 text-slate-400 hover:text-red-600 shrink-0"
                >
                  <X className="h-3 w-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {err && <p className="mt-1 text-[11px] text-red-600">{err}</p>}
    </div>
  )
}
