import { useState } from 'react'
import { PRIORITIES, PROGRESS_STEPS, PROJECT_STATUSES, isArchivedStatus, type Project } from '@/types'
import { emptyProject, createProject, updateProject, type ProjectInput } from '@/services/projectService'
import { todayStr } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'
import { Button, ConfirmDialog, Field, FormError, Input, Modal, Select, Textarea } from '@/components/ui'

// Create / edit product dialog. `project` = editing, undefined = creating.
export function ProjectForm({ open, project, onClose }: { open: boolean; project?: Project; onClose: () => void }) {
  return (
    <Modal open={open} onClose={onClose} title={project ? 'Edit Product' : 'Add Product'} wide>
      {/* key resets the form every time a different or updated product is opened */}
      <ProjectFormBody key={`${open ? 'open' : 'closed'}-${project?.id ?? 'new'}-${project?.updatedAt ?? ''}`} project={project} onClose={onClose} />
    </Modal>
  )
}

function ProjectFormBody({ project, onClose }: { project?: Project; onClose: () => void }) {
  const [form, setForm] = useState<ProjectInput>(() =>
    project
      ? {
          ...project,
          nickname: project.nickname ?? '',
          packageType: project.packageType ?? '',
          startDate: project.startDate || project.createdAt?.slice(0, 10) || todayStr(),
        }
      : emptyProject(),
  )
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [confirmArchive, setConfirmArchive] = useState(false)
  const set = <K extends keyof ProjectInput>(k: K, v: ProjectInput[K]) => setForm((f) => ({ ...f, [k]: v }))

  const willMoveToArchive = isArchivedStatus(form.status) && (!project || !isArchivedStatus(project.status))

  async function doSave() {
    setSaving(true)
    setError('')
    try {
      const payload: ProjectInput = {
        ...form,
        name: form.name.trim(),
        nickname: (form.nickname || '').trim(),
        packageType: (form.packageType || '').trim(),
      }
      if (project) await updateProject(project.id, payload)
      else await createProject(payload)
      onClose()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setSaving(false)
      setConfirmArchive(false)
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (willMoveToArchive) {
      setConfirmArchive(true)
      return
    }
    await doSave()
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <FormError message={error} />
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Project Code" required>
          <Input value={form.code} onChange={(e) => set('code', e.target.value)} placeholder="PM-101" maxLength={20} />
        </Field>
        <Field label="Product Name" required>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="AXON-400" />
        </Field>
        <Field label="Nickname">
          <Input value={form.nickname ?? ''} onChange={(e) => set('nickname', e.target.value)} placeholder="e.g. Pegasus" />
        </Field>
        <Field label="Package Type">
          <Input value={form.packageType} onChange={(e) => set('packageType', e.target.value)} placeholder="48-QFN-EP" />
        </Field>
        <Field label="Priority">
          <Select options={PRIORITIES} value={form.priority} onChange={(e) => set('priority', e.target.value as ProjectInput['priority'])} />
        </Field>
        <Field label="Status">
          <Select options={PROJECT_STATUSES} value={form.status} onChange={(e) => set('status', e.target.value as ProjectInput['status'])} />
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
          <Input type="date" value={form.baselineDate} onChange={(e) => set('baselineDate', e.target.value)} />
        </Field>
      </div>
      <Field label="Description">
        <Textarea value={form.description} onChange={(e) => set('description', e.target.value)} />
      </Field>
      {willMoveToArchive && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Setting status to <b>{form.status}</b> will move this product and all its stages/tasks to <b>Archived</b>. This action is non-returnable.
        </div>
      )}
      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" disabled={saving}>{saving ? 'Saving…' : 'Save Product'}</Button>
      </div>
      <ConfirmDialog
        open={confirmArchive}
        title={`Move ${form.name || form.code || 'Product'} to Archived?`}
        confirmLabel={`Confirm & Archive (${form.status})`}
        onCancel={() => setConfirmArchive(false)}
        onConfirm={doSave}
        message={
          <>
            Changing the status to <b>{form.status}</b> will move all data for <b>{form.name || form.code || 'this product'}</b> to the <b>Archived</b> tab. <b>This action is non-returnable.</b> Do you want to proceed?
          </>
        }
      />
    </form>
  )
}
