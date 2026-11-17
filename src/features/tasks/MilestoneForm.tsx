import { useState } from 'react'
import { MILESTONE_STATUSES, type Milestone, type Project } from '@/types'
import { createMilestone, emptyMilestone, updateMilestone, type MilestoneInput } from '@/services/milestoneService'
import { useTable } from '@/hooks/useTable'
import { errorMessage } from '@/utils/validation'
import { Button, Field, FormError, Input, LeftSlideDrawer, Modal, Select, Textarea } from '@/components/ui'

export function MilestoneForm({
  open,
  milestone,
  defaultProjectId,
  variant = 'modal',
  onClose,
}: {
  open: boolean
  milestone?: Milestone
  defaultProjectId?: string
  variant?: 'modal' | 'drawer'
  onClose: () => void
}) {
  const title = milestone ? 'Edit Milestone' : 'Add Milestone'
  const content = (
    <Body
      key={`${open ? 'open' : 'closed'}-${milestone?.id ?? 'new'}-${milestone?.updatedAt ?? ''}`}
      milestone={milestone}
      defaultProjectId={defaultProjectId}
      onClose={onClose}
    />
  )
  if (variant === 'drawer') {
    return (
      <LeftSlideDrawer open={open} onClose={onClose} title={title}>
        {open ? content : null}
      </LeftSlideDrawer>
    )
  }
  return (
    <Modal open={open} onClose={onClose} title={title} compact>
      {content}
    </Modal>
  )
}

function Body({ milestone, defaultProjectId, onClose }: { milestone?: Milestone; defaultProjectId?: string; onClose: () => void }) {
  const projects = useTable<Project>('projects') ?? []
  const [form, setForm] = useState<MilestoneInput>(milestone ? { ...milestone, workstreamId: '' } : emptyMilestone(defaultProjectId))
  const [error, setError] = useState('')
  const set = <K extends keyof MilestoneInput>(k: K, v: MilestoneInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    try {
      const payload: MilestoneInput = { ...form, workstreamId: '' }
      if (milestone) await updateMilestone(milestone.id, payload)
      else await createMilestone(payload)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <FormError message={error} />
      <Field label="Milestone Name" required>
        <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Tape Out Date, Drawing Approval Cut-off" />
      </Field>
      <Field label="Project (HRS Number)" required>
        <Select
          value={form.projectId}
          onChange={(e) => set('projectId', e.target.value)}
          options={[{ value: '', label: 'Select product…' }, ...projects.map((p) => ({ value: p.id, label: `${p.name}${p.packageType ? ` (${p.packageType})` : ''} [${p.code}]` }))]}
        />
      </Field>
      <Field label="Description"><Textarea value={form.description} onChange={(e) => set('description', e.target.value)} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Target Date" required><Input type="date" value={form.targetDate} onChange={(e) => set('targetDate', e.target.value)} /></Field>
        <Field label="Actual Completion Date"><Input type="date" value={form.actualDate} onChange={(e) => set('actualDate', e.target.value)} /></Field>
      </div>
      <Field label="Status"><Select options={MILESTONE_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value as MilestoneInput['status'])} /></Field>
      <Field label="Remarks"><Textarea value={form.remarks} onChange={(e) => set('remarks', e.target.value)} /></Field>
      <div className="flex justify-end gap-2">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary">Save Milestone</Button>
      </div>
    </form>
  )
}
