import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, GitBranch, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import {
  ACTIVE_PROJECT_STATUSES,
  PRODUCT_STAGES,
  PROJECT_STATUSES,
  STAGE_STATUSES,
  isArchivedStatus,
  type Project,
  type ProjectStatus,
  type StageStatus,
  type Workstream,
} from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loading, ProgressBar, Select } from '@/components/ui'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { WorkstreamForm } from '@/features/projects/WorkstreamForm'
import { deleteProject, updateProject } from '@/services/projectService'
import { deleteWorkstream, moveWorkstreamOrder, sortWorkstreams, updateWorkstream } from '@/services/workstreamService'
import { formatDate, isPast } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

type SortKey = 'name' | 'packageType' | 'status' | 'target'
const COLLAPSED_STORAGE_KEY = 'npi.projects.collapsedIds'

export function ProjectsPage() {
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')

  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [search, setSearch] = usePersistedState<string>('npi.projects.search', '')
  const [stageFilter, setStageFilter] = usePersistedState<string>('npi.projects.stageFilter', '')
  const [status, setStatus] = usePersistedState<string>('npi.projects.status', '')
  const [sort, setSort] = usePersistedState<{ key: SortKey; dir: 1 | -1 }>('npi.projects.sort', { key: 'name', dir: 1 })
  const [collapsedIds, setCollapsedIds] = usePersistedState<Record<string, boolean>>(COLLAPSED_STORAGE_KEY, {})

  const [formOpen, setFormOpen] = useState(false)
  const [editing, setEditing] = useState<Project | undefined>()
  const [deleting, setDeleting] = useState<Project | undefined>()
  const [archiving, setArchiving] = useState<{ project: Project; nextStatus: ProjectStatus } | undefined>()

  const [wsOpen, setWsOpen] = useState(false)
  const [wsProjectId, setWsProjectId] = useState('')
  const [wsEditing, setWsEditing] = useState<Workstream | undefined>()
  const [wsDeleting, setWsDeleting] = useState<Workstream | undefined>()

  const [error, setError] = useState('')

  useEffect(() => {
    if (params.get('new')) {
      setEditing(undefined)
      setFormOpen(true)
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const val = (p: Project): string | number => {
      switch (sort.key) {
        case 'target': return p.baselineDate || '9999'
        case 'status': return PROJECT_STATUSES.indexOf(p.status)
        case 'packageType': return (p.packageType || '').toLowerCase()
        default: return p.name.toLowerCase()
      }
    }
    return (projects ?? [])
      .filter((p) => !p.isNonNpi)
      .filter((p) => !isArchivedStatus(p.status))
      .filter((p) => !status || p.status === status)
      .filter((p) => {
        const pStages = (workstreams ?? []).filter((w) => w.projectId === p.id)
        if (stageFilter && !pStages.some((w) => w.category === stageFilter)) return false
        if (!q) return true
        const stageText = pStages.map((w) => `${w.category} ${w.name} ${w.status} ${w.remarks}`).join(' ')
        return `${p.code} ${p.name} ${p.packageType ?? ''} ${p.description} ${stageText}`.toLowerCase().includes(q)
      })
      .sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
  }, [projects, workstreams, search, stageFilter, status, sort])

  const toggleSort = (key: SortKey) => setSort((s) => (s.key === key ? { key, dir: (s.dir * -1) as 1 | -1 } : { key, dir: 1 }))
  const Th = ({ k, children }: { k?: SortKey; children: string }) => (
    <th className="px-3 py-2.5 font-semibold whitespace-nowrap">
      {k ? (
        <button onClick={() => toggleSort(k)} className="inline-flex items-center gap-1 hover:text-slate-900">
          {children}{sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)}
        </button>
      ) : children}
    </th>
  )

  async function confirmDelete() {
    if (!deleting) return
    try { await deleteProject(deleting.id); setDeleting(undefined) } catch (e) { setError(errorMessage(e)); setDeleting(undefined) }
  }

  async function confirmArchive() {
    if (!archiving) return
    try {
      await updateProject(archiving.project.id, { ...archiving.project, status: archiving.nextStatus })
      setArchiving(undefined)
    } catch (e) {
      setError(errorMessage(e))
      setArchiving(undefined)
    }
  }

  async function confirmDeleteStage() {
    if (!wsDeleting) return
    try { await deleteWorkstream(wsDeleting.id); setWsDeleting(undefined) } catch (e) { setError(errorMessage(e)); setWsDeleting(undefined) }
  }

  if (!projects || !workstreams) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search product, package, code, stage…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-72" />
        <Select className="!w-44" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} options={[{ value: '', label: 'All stage categories' }, ...PRODUCT_STAGES]} />
        <Select className="!w-40" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'All statuses' }, ...ACTIVE_PROJECT_STATUSES]} />
        <Button variant="primary" className="ml-auto" onClick={() => { setEditing(undefined); setFormOpen(true) }}>
          <Plus className="h-4 w-4" /> Add Product
        </Button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card className="!p-0">
        {rows.length === 0 ? (
          <EmptyState
            title={projects.length === 0 ? 'No products yet' : 'No products match your filters'}
            hint={projects.length === 0 ? 'Click "Add Product" to create your first product.' : 'Try clearing the search or filters.'}
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-slate-600 text-left bg-slate-100">
                <tr>
                  <Th k="name">Product Name / Stage</Th>
                  <Th k="packageType">Package Type / Category</Th>
                  <Th>Priority / Progress</Th>
                  <Th k="status">Status</Th>
                  <Th k="target">Target Date</Th>
                  <Th>Remarks / Stage</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const pStages = sortWorkstreams(workstreams.filter((w) => w.projectId === p.id))
                  const isCollapsed = !!collapsedIds[p.id]
                  return (
                    <ProductWithStagesGroup
                      key={p.id}
                      project={p}
                      stages={pStages}
                      collapsed={isCollapsed}
                      onToggleCollapse={() => setCollapsedIds((prev) => ({ ...prev, [p.id]: !prev[p.id] }))}
                      onNavigate={() => navigate(`/projects/${p.id}`)}
                      onEditProject={() => { setEditing(p); setFormOpen(true) }}
                      onDeleteProject={() => setDeleting(p)}
                      onRequestArchive={(nextStatus) => setArchiving({ project: p, nextStatus })}
                      onAddStage={() => { setWsProjectId(p.id); setWsEditing(undefined); setWsOpen(true) }}
                      onEditStage={(w) => { setWsProjectId(p.id); setWsEditing(w); setWsOpen(true) }}
                      onDeleteStage={(w) => setWsDeleting(w)}
                      onMoveStage={(w, dir) => void moveWorkstreamOrder(p.id, w.id, dir).catch((e) => setError(errorMessage(e)))}
                      onError={(msg) => setError(msg)}
                    />
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ProjectForm open={formOpen} project={editing} onClose={() => setFormOpen(false)} />
      <WorkstreamForm open={wsOpen} projectId={wsProjectId} workstream={wsEditing} onClose={() => setWsOpen(false)} />

      <ConfirmDialog
        open={!!deleting}
        title="Delete product?"
        onCancel={() => setDeleting(undefined)}
        onConfirm={confirmDelete}
        message={<>This permanently deletes <b>{deleting?.name} ({deleting?.packageType || deleting?.code})</b> and all its stages, tasks, milestones, and history. This cannot be undone.</>}
      />
      <ConfirmDialog
        open={!!wsDeleting}
        title="Delete product stage?"
        onCancel={() => setWsDeleting(undefined)}
        onConfirm={confirmDeleteStage}
        message={<>Delete stage <b>{wsDeleting?.name || wsDeleting?.category}</b>? Linked tasks and milestones will be detached.</>}
      />
      <ConfirmDialog
        open={!!archiving}
        title={`Move ${archiving?.project.name ?? ''} to Archived?`}
        confirmLabel={`Confirm & Archive (${archiving?.nextStatus ?? ''})`}
        onCancel={() => setArchiving(undefined)}
        onConfirm={confirmArchive}
        message={
          <>
            Changing the status to <b>{archiving?.nextStatus}</b> will move all data for <b>{archiving?.project.name}</b> to the <b>Archived</b> tab. <b>This action is non-returnable.</b> Do you want to proceed?
          </>
        }
      />
    </div>
  )
}

/**
 * Inline hover/click Status selector (renders Badge, opens native select on click/hover).
 */
export function InlineStatusSelect({
  value,
  options,
  onChange,
}: {
  value: string
  options: readonly string[]
  onChange: (next: string) => void
}) {
  return (
    <div
      className="relative inline-flex items-center group/status cursor-pointer rounded hover:ring-2 hover:ring-primary/30 transition-shadow"
      onClick={(e) => e.stopPropagation()}
      title="Click to change status directly"
    >
      <Badge>{value}</Badge>
      <ChevronDown className="h-3 w-3 text-slate-400 opacity-0 group-hover/status:opacity-100 ml-0.5 transition-opacity" />
      <select
        aria-label="Change status"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
      >
        {options.map((opt) => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
    </div>
  )
}

function ProductWithStagesGroup({
  project: p,
  stages,
  collapsed,
  onToggleCollapse,
  onNavigate,
  onEditProject,
  onDeleteProject,
  onRequestArchive,
  onAddStage,
  onEditStage,
  onDeleteStage,
  onMoveStage,
  onError,
}: {
  project: Project
  stages: Workstream[]
  collapsed: boolean
  onToggleCollapse: () => void
  onNavigate: () => void
  onEditProject: () => void
  onDeleteProject: () => void
  onRequestArchive: (nextStatus: ProjectStatus) => void
  onAddStage: () => void
  onEditStage: (w: Workstream) => void
  onDeleteStage: (w: Workstream) => void
  onMoveStage: (w: Workstream, dir: 'up' | 'down') => void
  onError: (msg: string) => void
}) {
  return (
    <>
      <tr onClick={onNavigate} className="border-t-2 border-slate-200 hover:bg-blue-50/40 cursor-pointer bg-white font-medium">
        <td className="px-3 py-2.5 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onToggleCollapse() }}
              className="p-0.5 rounded hover:bg-slate-200/70 text-slate-500"
              title={collapsed ? 'Expand stages' : 'Collapse stages'}
              aria-label={collapsed ? 'Expand stages' : 'Collapse stages'}
            >
              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <span className="font-bold text-primary">{p.name}</span>
            <Badge color="slate">{p.code}</Badge>
            <span className="text-[11px] font-normal text-slate-400">({stages.length} stages)</span>
          </div>
        </td>
        <td className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">{p.packageType || '—'}</td>
        <td className="px-3 py-2.5"><Badge>{p.priority}</Badge></td>
        <td className="px-3 py-2.5">
          <InlineStatusSelect
            value={p.status}
            options={PROJECT_STATUSES}
            onChange={async (next) => {
              const nextStatus = next as ProjectStatus
              if (isArchivedStatus(nextStatus)) {
                onRequestArchive(nextStatus)
                return
              }
              try { await updateProject(p.id, { ...p, status: nextStatus }) } catch (e) { onError(errorMessage(e)) }
            }}
          />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-xs">{formatDate(p.baselineDate)}</td>
        <td className="px-3 py-2.5 text-xs text-slate-500" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" className="!py-1 !px-2 text-xs text-primary" onClick={onAddStage}>
            <Plus className="h-3 w-3" /> Add Stage
          </Button>
        </td>
        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
          <div className="flex gap-1">
            <Button variant="ghost" size="sm" aria-label="Edit product" onClick={onEditProject}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="sm" aria-label="Delete product" onClick={onDeleteProject}><Trash2 className="h-3.5 w-3.5 text-red-500" /></Button>
          </div>
        </td>
      </tr>

      {!collapsed && stages.map((w, idx) => {
        const isLast = idx === stages.length - 1
        const late = w.status !== 'Done' && !!w.targetDate && isPast(w.targetDate)
        return (
          <tr key={w.id} className="border-t border-slate-100 bg-slate-50/75 hover:bg-blue-50/40 text-xs">
            <td className="pl-7 pr-2 py-2 whitespace-nowrap text-slate-700 select-none">
              <span className="inline-flex items-center gap-1.5">
                <span className="font-mono text-slate-400 font-bold text-sm leading-none">{isLast ? '└─' : '├─'}</span>
                <GitBranch className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                <button onClick={() => onEditStage(w)} className="font-semibold text-slate-800 hover:text-primary hover:underline">
                  {w.name || w.category}
                </button>
              </span>
            </td>
            <td className="px-3 py-2 whitespace-nowrap"><Badge color="indigo">{w.category}</Badge></td>
            <td className="px-3 py-2 w-28"><ProgressBar value={w.progress} /></td>
            <td className="px-3 py-2">
              <InlineStatusSelect
                value={w.status}
                options={STAGE_STATUSES}
                onChange={async (next) => {
                  try {
                    await updateWorkstream(w.id, { ...w, status: next as StageStatus })
                  } catch (e) {
                    onError(errorMessage(e))
                  }
                }}
              />
            </td>
            <td className={`px-3 py-2 whitespace-nowrap ${late ? 'text-red-600 font-semibold' : 'text-slate-600'}`}>
              {w.targetDate ? formatDate(w.targetDate) : '—'}
              {w.actualDate && <span className="block text-[11px] text-emerald-700">Act: {formatDate(w.actualDate)}</span>}
            </td>
            <td className="px-3 py-2 text-slate-500 max-w-[260px] truncate" title={w.remarks}>{w.remarks || '—'}</td>
            <td className="px-3 py-2 whitespace-nowrap">
              <div className="flex items-center gap-0.5">
                <Button
                  variant="ghost"
                  size="sm"
                  title="Move stage up"
                  aria-label="Move stage up"
                  disabled={idx === 0}
                  onClick={() => onMoveStage(w, 'up')}
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  title="Move stage down"
                  aria-label="Move stage down"
                  disabled={idx === stages.length - 1}
                  onClick={() => onMoveStage(w, 'down')}
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" title="Edit Stage" onClick={() => onEditStage(w)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="sm" title="Delete Stage" onClick={() => onDeleteStage(w)}>
                  <Trash2 className="h-3.5 w-3.5 text-red-500" />
                </Button>
              </div>
            </td>
          </tr>
        )
      })}
    </>
  )
}
