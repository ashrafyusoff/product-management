import { useState } from 'react'
import { PRODUCT_STAGES, PROGRESS_STEPS, STAGE_STATUSES, type Workstream } from '@/types'
import { createWorkstream, emptyWorkstream, updateWorkstream, type WorkstreamInput } from '@/services/workstreamService'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

export function WorkstreamForm({
  open,
  projectId,
  workstream,
  defaultCategory,
  onClose,
}: {
  open: boolean
  projectId: string
  workstream?: Workstream
  defaultCategory?: string
  onClose: () => void
}) {
  const formKey = `${open ? 'open' : 'closed'}-${workstream?.id ?? 'new'}-${workstream?.updatedAt ?? ''}-${defaultCategory ?? ''}`

  return (
    <Modal open={open} onClose={onClose} title={workstream ? 'Edit Product Stage' : 'Add Product Stage'} wide>
      <Body key={formKey} projectId={projectId} workstream={workstream} defaultCategory={defaultCategory} onClose={onClose} />
    </Modal>
  )
}

function Body({
  projectId,
  workstream,
  defaultCategory,
  onClose,
}: {
  projectId: string
  workstream?: Workstream
  defaultCategory?: string
  onClose: () => void
}) {
  const [form, setForm] = useState<WorkstreamInput>(() => {
    if (workstream) {
      const cat = workstream.category || 'Qual'
      return {
        ...workstream,
        category: cat,
        name: cat,
        status: STAGE_STATUSES.includes(workstream.status as (typeof STAGE_STATUSES)[number]) ? workstream.status : 'Not Started',
      }
    }
    const base = emptyWorkstream(projectId)
    if (defaultCategory) {
      base.category = defaultCategory
      base.name = defaultCategory
    }
    return base
  })

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const set = <K extends keyof WorkstreamInput>(k: K, v: WorkstreamInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      const payload: WorkstreamInput = {
        ...form,
        name: form.category,
      }
      if (workstream) await updateWorkstream(workstream.id, payload)
      else await createWorkstream(payload)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Stage Category" required>
          <Select
            options={PRODUCT_STAGES}
            value={PRODUCT_STAGES.includes(form.category as (typeof PRODUCT_STAGES)[number]) ? form.category : 'Qual'}
            onChange={(e) => {
              const cat = e.target.value
              setForm((f) => ({ ...f, category: cat, name: cat }))
            }}
          />
        </Field>
        <Field label="Stage Status">
          <Select
            options={STAGE_STATUSES}
            value={form.status}
            onChange={(e) => set('status', e.target.value as WorkstreamInput['status'])}
          />
        </Field>
        <Field label="Progress">
          <Select
            value={String(form.progress)}
            onChange={(e) => set('progress', Number(e.target.value))}
            options={PROGRESS_STEPS.map((n) => ({ value: String(n), label: `${n}%` }))}
          />
        </Field>
        <Field label="Start Date">
          <Input type="date" value={form.startDate} onChange={(e) => set('startDate', e.target.value)} />
        </Field>
        <Field label="Target Date">
          <Input type="date" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} />
        </Field>
        <Field label="Actual Completion Date">
          <Input type="date" value={form.actualDate} onChange={(e) => set('actualDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Remarks / Action Notes">
        <Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} placeholder="Latest status, owner, or next action…" />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save Stage'}</Button>
      </div>
    </form>
  )
}
