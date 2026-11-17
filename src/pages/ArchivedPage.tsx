import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Archive, ArrowDown, ArrowUp, ChevronDown, ChevronRight, FileSpreadsheet, GitBranch, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import {
  ARCHIVED_PROJECT_STATUSES,
  PRODUCT_STAGES,
  isArchivedStatus,
  type Project,
  type Workstream,
} from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Input, Loading, ProgressBar, Select } from '@/components/ui'
import { exportReport, exportSingleProjectReport } from '@/services/exportService'
import { deleteProject } from '@/services/projectService'
import { formatDate } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

type SortKey = 'name' | 'packageType' | 'status' | 'target'

export function ArchivedPage() {
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')

  const navigate = useNavigate()
  const [search, setSearch] = usePersistedState<string>('npi.archived.search', '')
  const [stageFilter, setStageFilter] = usePersistedState<string>('npi.archived.stageFilter', '')
  const [status, setStatus] = usePersistedState<string>('npi.archived.status', '')
  const [sort, setSort] = usePersistedState<{ key: SortKey; dir: 1 | -1 }>('npi.archived.sort', { key: 'name', dir: 1 })
  const [collapsedIds, setCollapsedIds] = usePersistedState<Record<string, boolean>>('npi.archived.collapsedIds', {})
  const [deleting, setDeleting] = useState<Project | undefined>()
  const [error, setError] = useState('')

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    const val = (p: Project): string | number => {
      switch (sort.key) {
        case 'target': return p.baselineDate || '9999'
        case 'status': return ARCHIVED_PROJECT_STATUSES.indexOf(p.status as (typeof ARCHIVED_PROJECT_STATUSES)[number])
        case 'packageType': return (p.packageType || '').toLowerCase()
        default: return p.name.toLowerCase()
      }
    }
    return (projects ?? [])
      .filter((p) => isArchivedStatus(p.status))
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

  if (!projects || !workstreams) return <Loading />

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
        <div className="flex items-center gap-2.5">
          <Archive className="h-4 w-4 text-slate-500 shrink-0" />
          <span>Archived products (<b>Completed</b> or <b>Cancelled</b>) are read-only and cannot be returned to active status.</span>
        </div>
        <Button size="sm" onClick={() => exportReport('Archived')}>
          <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Archived Excel
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input placeholder="Search archived products, packages, stages…" value={search} onChange={(e) => setSearch(e.target.value)} className="!w-72" />
        <Select className="!w-44" value={stageFilter} onChange={(e) => setStageFilter(e.target.value)} options={[{ value: '', label: 'All stage categories' }, ...PRODUCT_STAGES]} />
        <Select className="!w-40" value={status} onChange={(e) => setStatus(e.target.value)} options={[{ value: '', label: 'All archived' }, ...ARCHIVED_PROJECT_STATUSES]} />
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Card className="!p-0">
        {rows.length === 0 ? (
          <EmptyState
            title="No archived products"
            hint="When a product is marked Completed or Cancelled, it will appear here."
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
                  <Th k="target">Target / Actual Date</Th>
                  <Th>Remarks</Th>
                  <Th>Actions</Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => {
                  const pStages = workstreams.filter((w) => w.projectId === p.id)
                  const collapsed = !!collapsedIds[p.id]
                  return (
                    <>
                      <tr key={p.id} onClick={() => navigate(`/projects/${p.id}`)} className="border-t-2 border-slate-200 hover:bg-blue-50/40 cursor-pointer bg-white font-medium">
                        <td className="px-3 py-2.5 whitespace-nowrap">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); setCollapsedIds((prev) => ({ ...prev, [p.id]: !prev[p.id] })) }}
                              className="p-0.5 rounded hover:bg-slate-200/70 text-slate-500"
                              aria-label={collapsed ? 'Expand' : 'Collapse'}
                            >
                              {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <span className="font-bold text-primary">{p.name}</span>
                            <Badge color="slate">{p.code}</Badge>
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-slate-700 whitespace-nowrap">{p.packageType || '—'}</td>
                        <td className="px-3 py-2.5"><Badge>{p.priority}</Badge></td>
                        <td className="px-3 py-2.5"><Badge>{p.status}</Badge></td>
                        <td className="px-3 py-2.5 whitespace-nowrap text-xs">
                          {formatDate(p.baselineDate)}
                          {p.actualDate && <span className="block text-[11px] text-emerald-700">Act: {formatDate(p.actualDate)}</span>}
                        </td>
                        <td className="px-3 py-2.5 text-xs text-slate-500 max-w-[220px] truncate">{p.remarks || p.description || '—'}</td>
                        <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" title="Export Report" onClick={() => exportSingleProjectReport(p.id)}>
                              <FileSpreadsheet className="h-3.5 w-3.5 text-emerald-600" />
                            </Button>
                            <Button variant="ghost" size="sm" aria-label="Delete archived product" onClick={() => setDeleting(p)}>
                              <Trash2 className="h-3.5 w-3.5 text-red-500" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {!collapsed && pStages.map((w, idx) => (
                        <tr key={w.id} className="border-t border-slate-100 bg-slate-50/75 text-xs">
                          <td className="pl-7 pr-2 py-2 whitespace-nowrap text-slate-700">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="font-mono text-slate-400 font-bold text-sm leading-none">{idx === pStages.length - 1 ? '└─' : '├─'}</span>
                              <GitBranch className="h-3.5 w-3.5 text-primary/80 shrink-0" />
                              <span className="font-semibold text-slate-800">{w.name || w.category}</span>
                            </span>
                          </td>
                          <td className="px-3 py-2 whitespace-nowrap"><Badge color="indigo">{w.category}</Badge></td>
                          <td className="px-3 py-2 w-28"><ProgressBar value={w.progress} /></td>
                          <td className="px-3 py-2"><Badge>{w.status}</Badge></td>
                          <td className="px-3 py-2 whitespace-nowrap text-slate-600">{w.actualDate ? formatDate(w.actualDate) : formatDate(w.targetDate)}</td>
                          <td className="px-3 py-2 text-slate-500 max-w-[220px] truncate">{w.remarks || '—'}</td>
                          <td className="px-3 py-2" />
                        </tr>
                      ))}
                    </>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={!!deleting}
        title="Delete archived product?"
        onCancel={() => setDeleting(undefined)}
        onConfirm={confirmDelete}
        message={<>Permanently delete <b>{deleting?.name} ({deleting?.packageType || deleting?.code})</b>? This cannot be undone.</>}
      />
    </div>
  )
}
