import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Archive, ArrowDown, ArrowLeft, ArrowUp, Calendar, Cpu, FileSpreadsheet, GitBranch, Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { db } from '@/database/db'
import {
  PRODUCT_STAGES,
  STAGE_STATUSES,
  isArchivedStatus,
  type Milestone,
  type StageStatus,
  type Task,
  type Workstream,
} from '@/types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Loading, ProgressBar } from '@/components/ui'
import { ProjectForm } from '@/features/projects/ProjectForm'
import { WorkstreamForm } from '@/features/projects/WorkstreamForm'
import { ProjectGanttChart } from '@/features/projects/ProjectGanttChart'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'
import { TaskTable } from '@/features/tasks/TaskTable'
import { MilestoneTable } from '@/features/tasks/MilestoneTable'
import { InlineStatusSelect } from './ProjectsPage'
import { exportSingleProjectReport } from '@/services/exportService'
import { deleteTask } from '@/services/taskService'
import { deleteMilestone } from '@/services/milestoneService'
import { deleteProject } from '@/services/projectService'
import { deleteWorkstream, moveWorkstreamOrder, sortWorkstreams, updateWorkstream } from '@/services/workstreamService'
import { daysUntil, formatDate, formatDateTime, isPast } from '@/utils/helpers'
import { errorMessage } from '@/utils/validation'

const TABS = ['Overview', 'Product Stages', 'Tasks', 'Milestones', 'Activity History'] as const
type Tab = (typeof TABS)[number]

function useProjectData(id: string) {
  return useLiveQuery(async () => {
    const [project, workstreams, tasks, milestones, logs] = await Promise.all([
      db.projects.get(id),
      db.workstreams.where('projectId').equals(id).toArray(),
      db.tasks.where('projectId').equals(id).toArray(),
      db.milestones.where('projectId').equals(id).toArray(),
      db.activityLogs.where('projectId').equals(id).toArray(),
    ])
    return { project, workstreams, tasks, milestones, logs }
  }, [id])
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="overflow-x-auto -mx-4 -mb-4">
      <table className="w-full text-sm">
        <thead className="text-xs text-slate-500 text-left bg-slate-50">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2 font-medium whitespace-nowrap">{h}</th>)}</tr>
        </thead>
        <tbody className="[&>tr]:border-t [&>tr]:border-slate-100 [&_td]:px-4 [&_td]:py-2">{children}</tbody>
      </table>
    </div>
  )
}

export function ProjectDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const data = useProjectData(id)
  const [tab, setTab] = useState<Tab>(() =>
    searchParams.get('tab') === 'stages' ? 'Product Stages' : 'Overview',
  )

  useEffect(() => {
    if (searchParams.get('tab') === 'stages') {
      setTab('Product Stages')
    }
  }, [searchParams])

  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [wsOpen, setWsOpen] = useState(false)
  const [wsDefaultCategory, setWsDefaultCategory] = useState<string | undefined>()
  const [wsEditing, setWsEditing] = useState<Workstream | undefined>()
  const [wsDeleting, setWsDeleting] = useState<Workstream | undefined>()
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskEditing, setTaskEditing] = useState<Task | undefined>()
  const [taskDeleting, setTaskDeleting] = useState<Task | undefined>()
  const [msOpen, setMsOpen] = useState(false)
  const [msEditing, setMsEditing] = useState<Milestone | undefined>()
  const [msDeleting, setMsDeleting] = useState<Milestone | undefined>()
  const [error, setError] = useState('')

  if (!data) return <Loading />
  const { project: p, workstreams: rawWorkstreams, tasks, milestones, logs } = data
  const workstreams = sortWorkstreams(rawWorkstreams)
  if (!p) {
    return (
      <Card>
        <EmptyState
          title="Product not found"
          hint="It may have been deleted."
          action={<Button onClick={() => navigate('/projects')}>Back to Products</Button>}
        />
      </Card>
    )
  }

  const archived = isArchivedStatus(p.status)
  const openTasks = tasks.filter((t) => t.status !== 'Completed' && t.status !== 'Cancelled')
  const openMilestones = milestones.filter((m) => m.status !== 'Completed')
  const tabCls = (t: Tab) =>
    `px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${
      tab === t ? 'border-primary text-primary font-medium' : 'border-transparent text-slate-500 hover:text-slate-800'
    }`

  const openAddStage = (category?: string) => {
    setWsEditing(undefined)
    setWsDefaultCategory(category)
    setWsOpen(true)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Link to={archived ? '/archived' : '/projects'} className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-slate-900">
          <ArrowLeft className="h-4 w-4" /> Back to {archived ? 'Archived' : 'Products'}
        </Link>
        {archived && (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-800">
            <Archive className="h-3.5 w-3.5" /> Archived ({p.status}) — Read-only / non-returnable
          </div>
        )}
      </div>

      {/* Header: Product Name + Package Type */}
      <Card>
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex-1 min-w-[260px]">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold text-slate-900">{p.name}</h2>
              {p.packageType && <Badge color="indigo">{p.packageType}</Badge>}
              <Badge color="slate">{p.code}</Badge>
              <Badge>{p.priority}</Badge>
              <Badge>{p.status}</Badge>
            </div>
            {p.description && <p className="text-sm text-slate-600 mt-1">{p.description}</p>}
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 mt-3">
              <span className="inline-flex items-center gap-1"><Cpu className="h-3.5 w-3.5" /> Product: <b className="text-slate-700">{p.name}</b></span>
              {p.packageType && <span className="inline-flex items-center gap-1"><Layers className="h-3.5 w-3.5" /> Package: <b className="text-slate-700">{p.packageType}</b></span>}
              <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Start: <b className="text-slate-700">{formatDate(p.startDate)}</b></span>
              <span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" /> Target: <b className="text-slate-700">{formatDate(p.baselineDate)}</b></span>
              {p.revisedDate && <span>Revised: <b className="text-slate-700">{formatDate(p.revisedDate)}</b></span>}
              {p.actualDate && <span>Actual: <b className="text-slate-700">{formatDate(p.actualDate)}</b></span>}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button onClick={() => exportSingleProjectReport(p.id)}>
              <FileSpreadsheet className="h-4 w-4 text-emerald-600" /> Export Report & Gantt
            </Button>
            {!archived && (
              <Button onClick={() => setEditOpen(true)}>
                <Pencil className="h-4 w-4" /> Edit Product
              </Button>
            )}
            <Button variant="danger" onClick={() => setDeleteOpen(true)}>
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
          </div>
        </div>
      </Card>

      {/* Tabs */}
      <div className="flex border-b border-slate-200 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)} className={tabCls(t)}>
            {t}
            {t === 'Product Stages' && <span className="ml-1 text-xs text-slate-400">{workstreams.length}</span>}
            {t === 'Tasks' && <span className="ml-1 text-xs text-slate-400">{tasks.length}</span>}
            {t === 'Milestones' && <span className="ml-1 text-xs text-slate-400">{milestones.length}</span>}
          </button>
        ))}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      {tab === 'Overview' && (
        <div className="space-y-4">
          {/* 8 Product Stage Categories Grid */}
          <Card
            title="Product Stage Coverage (Qual → PN Setup)"
            action={
              !archived && (
                <Button size="sm" variant="primary" onClick={() => openAddStage()}>
                  <Plus className="h-3.5 w-3.5" /> Add Stage
                </Button>
              )
            }
          >
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {PRODUCT_STAGES.map((cat) => {
                const items = workstreams.filter((w) => w.category === cat)
                return (
                  <div key={cat} className="rounded-lg border border-slate-200 bg-slate-50/70 p-3 flex flex-col gap-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-800 uppercase tracking-wide">{cat}</span>
                      {!archived && (
                        <button
                          onClick={() => openAddStage(cat)}
                          className="text-[11px] font-medium text-primary hover:underline inline-flex items-center gap-0.5"
                          title={`Add ${cat} stage`}
                        >
                          <Plus className="h-3 w-3" /> Add
                        </button>
                      )}
                    </div>
                    {items.length === 0 ? (
                      <p className="text-xs text-slate-400 italic">Not started / none</p>
                    ) : (
                      <div className="space-y-1.5">
                        {items.map((w) => (
                          <button
                            key={w.id}
                            onClick={() => { setWsEditing(w); setWsDefaultCategory(undefined); setWsOpen(true) }}
                            className="w-full text-left rounded border border-slate-200 bg-white px-2.5 py-1.5 hover:border-primary/50 transition-colors"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-xs font-medium text-slate-800 truncate">{w.name || w.category}</span>
                              <Badge>{w.status}</Badge>
                            </div>
                            {w.targetDate && (
                              <p className="text-[11px] text-slate-500 mt-0.5">Target: {formatDate(w.targetDate)}</p>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </Card>

          <ProjectGanttChart project={p} workstreams={workstreams} milestones={milestones} tasks={tasks} />

          <div className="grid lg:grid-cols-2 gap-4">
            <Card title={`Open Tasks (${openTasks.length})`} action={<button className="text-xs text-primary hover:underline" onClick={() => setTab('Tasks')}>View all</button>}>
              {openTasks.length === 0 ? <p className="text-sm text-slate-400">No open tasks.</p> : (
                <ul className="space-y-2 text-sm">
                  {openTasks.slice(0, 6).map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{t.name}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">{formatDate(t.dueDate)} · <Badge>{t.status}</Badge></span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={`Upcoming Milestones (${openMilestones.length})`} action={<button className="text-xs text-primary hover:underline" onClick={() => setTab('Milestones')}>View all</button>}>
              {openMilestones.length === 0 ? <p className="text-sm text-slate-400">No pending milestones.</p> : (
                <ul className="space-y-2 text-sm">
                  {openMilestones.slice(0, 6).map((m) => (
                    <li key={m.id} className="flex items-center justify-between gap-2">
                      <span className="truncate">{m.name}</span>
                      <span className="text-xs text-slate-500 whitespace-nowrap">
                        {formatDate(m.targetDate)} {daysUntil(m.targetDate) < 0 && <span className="text-red-600">(late)</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </div>
      )}

      {tab === 'Product Stages' && (
        <Card
          title="Product Stages"
          action={!archived && <Button size="sm" variant="primary" onClick={() => openAddStage()}><Plus className="h-4 w-4" /> Add Stage</Button>}
        >
          {workstreams.length === 0 ? (
            <EmptyState
              title="No product stages yet"
              hint="Add stages like Qual, Sample, PPAP, PCN, Safe Launch, CMT, OB conversion, or PN Setup."
            />
          ) : (
            <Table head={['Category', 'Progress', 'Status', 'Target Date', 'Remarks', 'Actions']}>
              {workstreams.map((w, idx) => {
                const late = w.status !== 'Done' && !!w.targetDate && isPast(w.targetDate)
                return (
                  <tr key={w.id}>
                    <td className="font-medium text-slate-800">
                      <span className="inline-flex items-center gap-1.5">
                        <GitBranch className="h-3.5 w-3.5 text-primary/70 shrink-0" />
                        <Badge color="indigo">{w.category}</Badge>
                      </span>
                    </td>
                    <td className="w-28"><ProgressBar value={w.progress} /></td>
                    <td>
                      {archived ? (
                        <Badge>{w.status}</Badge>
                      ) : (
                        <InlineStatusSelect
                          value={w.status}
                          options={STAGE_STATUSES}
                          onChange={async (next) => {
                            try {
                              await updateWorkstream(w.id, { ...w, status: next as StageStatus })
                            } catch (e) {
                              setError(errorMessage(e))
                            }
                          }}
                        />
                      )}
                    </td>
                    <td className={late ? 'text-red-600 font-medium whitespace-nowrap' : 'whitespace-nowrap'}>
                      {w.targetDate ? formatDate(w.targetDate) : '—'}
                    </td>
                    <td className="text-slate-500 max-w-[260px] truncate" title={w.remarks}>{w.remarks || '—'}</td>
                    <td className="whitespace-nowrap">
                      {!archived && (
                        <>
                          <Button variant="ghost" size="sm" title="Move stage up" disabled={idx === 0} onClick={() => void moveWorkstreamOrder(p.id, w.id, 'up')}>
                            <ArrowUp className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" title="Move stage down" disabled={idx === workstreams.length - 1} onClick={() => void moveWorkstreamOrder(p.id, w.id, 'down')}>
                            <ArrowDown className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => { setWsEditing(w); setWsDefaultCategory(undefined); setWsOpen(true) }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => setWsDeleting(w)}>
                            <Trash2 className="h-3.5 w-3.5 text-red-500" />
                          </Button>
                        </>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </Card>
      )}

      {tab === 'Tasks' && (
        <Card
          title="Tasks"
          action={!archived && <Button size="sm" variant="primary" onClick={() => { setTaskEditing(undefined); setTaskOpen(true) }}><Plus className="h-4 w-4" /> Add Task</Button>}
        >
          {tasks.length === 0 ? <EmptyState title="No tasks for this product" /> : (
            <TaskTable
              tasks={tasks}
              projects={[p]}
              workstreams={workstreams}
              showProject={false}
              onEdit={(t) => { setTaskEditing(t); setTaskOpen(true) }}
              onDelete={setTaskDeleting}
            />
          )}
        </Card>
      )}

      {tab === 'Milestones' && (
        <Card
          title="Milestones"
          action={!archived && <Button size="sm" variant="primary" onClick={() => { setMsEditing(undefined); setMsOpen(true) }}><Plus className="h-4 w-4" /> Add Milestone</Button>}
        >
          {milestones.length === 0 ? <EmptyState title="No milestones for this product" /> : (
            <MilestoneTable
              milestones={milestones}
              projects={[p]}
              workstreams={workstreams}
              showProject={false}
              onEdit={(m) => { setMsEditing(m); setMsOpen(true) }}
              onDelete={setMsDeleting}
            />
          )}
        </Card>
      )}

      {tab === 'Activity History' && (
        <Card title="Activity History">
          {logs.length === 0 ? <EmptyState title="No activity logged yet" /> : (
            <ul className="space-y-2 text-sm">
              {[...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((l) => (
                <li key={l.id} className="flex justify-between gap-4 border-b border-slate-100 pb-2">
                  <span><Badge>{l.action}</Badge> <b className="ml-1">{l.entity}</b> — {l.message}</span>
                  <span className="text-xs text-slate-400 whitespace-nowrap">{formatDateTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <ProjectForm open={editOpen} project={p} onClose={() => setEditOpen(false)} />
      <WorkstreamForm open={wsOpen} projectId={p.id} workstream={wsEditing} defaultCategory={wsDefaultCategory} onClose={() => setWsOpen(false)} />
      <TaskForm open={taskOpen} task={taskEditing} defaultProjectId={p.id} onClose={() => setTaskOpen(false)} />
      <MilestoneForm open={msOpen} milestone={msEditing} defaultProjectId={p.id} onClose={() => setMsOpen(false)} />

      <ConfirmDialog
        open={deleteOpen}
        title="Delete product?"
        onCancel={() => setDeleteOpen(false)}
        onConfirm={async () => { await deleteProject(p.id); navigate('/projects') }}
        message={<>This permanently deletes <b>{p.name} ({p.packageType || p.code})</b> and all its stages, tasks, milestones, and logs.</>}
      />
      <ConfirmDialog
        open={!!wsDeleting}
        title="Delete stage?"
        onCancel={() => setWsDeleting(undefined)}
        onConfirm={async () => { try { await deleteWorkstream(wsDeleting!.id) } catch (e) { setError(errorMessage(e)) } setWsDeleting(undefined) }}
        message={<>Delete stage <b>{wsDeleting?.name || wsDeleting?.category}</b>? Linked tasks and milestones will be detached.</>}
      />
      <ConfirmDialog
        open={!!taskDeleting}
        title="Delete task?"
        onCancel={() => setTaskDeleting(undefined)}
        onConfirm={async () => { try { await deleteTask(taskDeleting!.id) } catch (e) { setError(errorMessage(e)) } setTaskDeleting(undefined) }}
        message={<>Delete <b>{taskDeleting?.name}</b>?</>}
      />
      <ConfirmDialog
        open={!!msDeleting}
        title="Delete milestone?"
        onCancel={() => setMsDeleting(undefined)}
        onConfirm={async () => { try { await deleteMilestone(msDeleting!.id) } catch (e) { setError(errorMessage(e)) } setMsDeleting(undefined) }}
        message={<>Delete milestone <b>{msDeleting?.name}</b>?</>}
      />
    </div>
  )
}
