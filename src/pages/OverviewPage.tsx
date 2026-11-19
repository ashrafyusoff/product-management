import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { CartesianGrid, Cell, Legend, Line, LineChart, Pie, PieChart, ReferenceLine, ResponsiveContainer, XAxis, YAxis } from 'recharts'
import { CheckSquare, Plus, Square, StickyNote, Trash2 } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { usePersistedState } from '@/hooks/usePersistedState'
import type { ActivityLog, Milestone, Project, Task, Workstream } from '@/types'
import { PRODUCT_STAGES, PROJECT_STATUSES, isArchivedStatus } from '@/types'
import { Badge, Button, Card, EmptyState, Loading } from '@/components/ui'
import { daysUntil, formatDate, formatDateTime, newId, todayStr } from '@/utils/helpers'
import { loadSampleData } from '@/services/sampleData'
import { WorkWeekCalendar, addDays, getIsoWeek, getMondayOfWeek, parseYmd, toYmd } from '@/features/overview/WorkWeekCalendar'
import { TaskForm } from '@/features/tasks/TaskForm'
import { MilestoneForm } from '@/features/tasks/MilestoneForm'
import { WorkstreamForm } from '@/features/projects/WorkstreamForm'

const STATUS_COLORS: Record<string, string> = {
  Planning: '#8b5cf6',
  'In Progress': '#2563eb',
  'On Hold': '#f59e0b',
  Delayed: '#ef4444',
  Completed: '#10b981',
  Cancelled: '#94a3b8',
}

function stagePillClass(status: string): string {
  switch (status) {
    case 'Done':
    case 'Completed':
      return 'bg-emerald-100 text-emerald-800 border-emerald-300'
    case 'On Track':
      return 'bg-blue-100 text-blue-800 border-blue-300'
    case 'Watch':
      return 'bg-amber-100 text-amber-900 border-amber-300'
    case 'Risk':
      return 'bg-orange-100 text-orange-900 border-orange-300'
    case 'Urgent':
      return 'bg-rose-100 text-rose-900 border-rose-300 font-bold'
    case 'On Hold':
      return 'bg-slate-200 text-slate-700 border-slate-300'
    case 'Cancelled':
      return 'bg-slate-100 text-slate-400 border-slate-200 line-through'
    default:
      return 'bg-slate-100 text-slate-600 border-slate-200'
  }
}

interface QuickNoteItem {
  id: string
  text: string
  done: boolean
  createdAt: string
}

export function OverviewPage() {
  const navigate = useNavigate()
  const projects = useTable<Project>('projects')
  const workstreams = useTable<Workstream>('workstreams')
  const tasks = useTable<Task>('tasks')
  const milestones = useTable<Milestone>('milestones')
  const logs = useTable<ActivityLog>('activityLogs')

  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [taskDefaultDueDate, setTaskDefaultDueDate] = useState<string | undefined>()
  const [milestoneModalOpen, setMilestoneModalOpen] = useState(false)
  const [editingMilestone, setEditingMilestone] = useState<Milestone | undefined>()

  // Modal for adding/editing a Product Stage directly from the Product Stage Matrix
  const [stageModalOpen, setStageModalOpen] = useState(false)
  const [stageProjectId, setStageProjectId] = useState('')
  const [stageDefaultCategory, setStageDefaultCategory] = useState<string | undefined>()
  const [editingStage, setEditingStage] = useState<Workstream | undefined>()

  const [quickNotes, setQuickNotes] = usePersistedState<QuickNoteItem[]>('npi.overview.quickNotes', [
    { id: 'sample-note-1', text: 'Follow up Assy PCN non-block waiver & ARAS setup', done: false, createdAt: todayStr() },
    { id: 'sample-note-2', text: 'Verify Safe Launch lot closure before OB conversion', done: false, createdAt: todayStr() },
  ])
  const [newNoteText, setNewNoteText] = useState('')

  const workloadData = useMemo(() => {
    if (!tasks || !projects) return []
    const projMap = new Map(projects.map((p) => [p.id, p]))
    const currentMon = getMondayOfWeek(parseYmd(todayStr()))

    return Array.from({ length: 17 }, (_, idx) => idx - 8).map((offset) => {
      const mon = addDays(currentMon, offset * 7)
      const sun = addDays(mon, 6)
      const monYmd = toYmd(mon)
      const sunYmd = toYmd(sun)
      const ww = getIsoWeek(mon)
      const wwLabel = offset === 0 ? `WW${String(ww).padStart(2, '0')}*` : `WW${String(ww).padStart(2, '0')}`

      let productTasks = 0
      let nonNpiTasks = 0

      for (const t of tasks) {
        if (t.status === 'Cancelled') continue
        const effDate = t.dueDate || t.startDate
        if (!effDate) continue
        const inWeek =
          (effDate >= monYmd && effDate <= sunYmd) ||
          (!!t.startDate && !!t.dueDate && t.startDate <= sunYmd && t.dueDate >= monYmd)
        if (!inWeek) continue

        const proj = projMap.get(t.projectId)
        if (proj?.isNonNpi) nonNpiTasks++
        else productTasks++
      }

      return {
        week: wwLabel,
        'Product Tasks': productTasks,
        'Side-Quest Tasks': nonNpiTasks,
      }
    })
  }, [tasks, projects])

  if (!projects || !workstreams || !tasks || !milestones || !logs) return <Loading />

  if (projects.length === 0) {
    return (
      <Card>
        <EmptyState
          title="Welcome to Product Management"
          hint="Start by loading sample semiconductor products or adding your first product."
          action={
            <div className="flex gap-2 justify-center">
              <Button variant="primary" onClick={() => loadSampleData()}>Load Sample Data</Button>
              <Button onClick={() => navigate('/projects')}>Add Product</Button>
            </div>
          }
        />
      </Card>
    )
  }

  const productProjects = projects.filter((p) => !p.isNonNpi)
  const activeProducts = productProjects.filter((p) => !isArchivedStatus(p.status))
  const nonNpiProjects = projects.filter((p) => !!p.isNonNpi)

  const buildStatusSummary = (list: Project[]) =>
    PROJECT_STATUSES.map((s) => ({ name: s, value: list.filter((p) => p.status === s).length })).filter((d) => d.value > 0)

  const productChartData = buildStatusSummary(productProjects)
  const nonNpiChartData = buildStatusSummary(nonNpiProjects)
  const productStatusRows = PROJECT_STATUSES.map((s) => ({ name: s, value: productProjects.filter((p) => p.status === s).length }))
  const nonNpiStatusRows = PROJECT_STATUSES.map((s) => ({ name: s, value: nonNpiProjects.filter((p) => p.status === s).length }))

  const currentWeekTick = workloadData.find((w) => w.week.endsWith('*'))?.week
  const latest15Logs = [...logs].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 15)

  function handleAddQuickNote(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = newNoteText.trim()
    if (!trimmed) return
    setQuickNotes((prev) => [{ id: newId(), text: trimmed, done: false, createdAt: todayStr() }, ...prev])
    setNewNoteText('')
  }

  return (
    <div className="space-y-4">
      {/* Top: 5-day Workweek Calendar for Tasks and Milestones (Multi-Week & Outlook 1-Week Hourly) */}
      <div className="grid xl:grid-cols-3 gap-4">
        <WorkWeekCalendar
          tasks={tasks}
          milestones={milestones}
          projects={projects}
          onAddTask={(dueDate) => { setMilestoneModalOpen(false); setEditingTask(undefined); setTaskDefaultDueDate(dueDate); setTaskModalOpen(true) }}
          onEditTask={(t) => { setMilestoneModalOpen(false); setTaskDefaultDueDate(undefined); setEditingTask(t); setTaskModalOpen(true) }}
          onEditMilestone={(m) => { setTaskModalOpen(false); setEditingMilestone(m); setMilestoneModalOpen(true) }}
        />
      </div>

      {/* Product Management Stage Matrix: Header = Product Name + Package Type, Columns = 8 Categories */}
      <Card
        title="Product Stage Matrix — Multi-Stage Tracking"
        action={
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-400" /> Done</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-blue-400" /> On Track</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Watch</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-orange-400" /> Risk</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-sm bg-rose-500" /> Urgent</span>
          </div>
        }
        className="[&>div]:!p-0"
      >
        {activeProducts.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-400">No active products yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-100 text-slate-600 text-left border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5 font-semibold whitespace-nowrap sticky left-0 bg-slate-100 z-10 min-w-[200px]">
                    Product Name · Package Type
                  </th>
                  {PRODUCT_STAGES.map((cat) => (
                    <th key={cat} className="px-2.5 py-2.5 font-semibold whitespace-nowrap text-center min-w-[115px]">
                      {cat}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeProducts.map((p) => {
                  const pStages = workstreams.filter((w) => w.projectId === p.id)
                  return (
                    <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50/70">
                      <td className="px-3 py-2.5 sticky left-0 bg-white z-10 border-r border-slate-100">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <Link to={`/projects/${p.id}`} className="font-bold text-primary hover:underline block truncate">
                              {p.name}
                            </Link>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {p.packageType || 'No package'} · {p.code}
                            </span>
                          </div>
                          <Badge>{p.priority}</Badge>
                        </div>
                      </td>
                      {PRODUCT_STAGES.map((cat) => {
                        const cellStages = pStages.filter((w) => w.category === cat)
                        return (
                          <td key={cat} className="px-2 py-2 align-top border-r last:border-r-0 border-slate-100">
                            {cellStages.length === 0 ? (
                              <button
                                onClick={() => {
                                  setEditingStage(undefined)
                                  setStageProjectId(p.id)
                                  setStageDefaultCategory(cat)
                                  setStageModalOpen(true)
                                }}
                                title={`Add ${cat} stage to ${p.name}`}
                                className="w-full py-1 rounded border border-dashed border-transparent hover:border-slate-300 text-slate-300 hover:text-slate-600 text-[11px] transition-colors"
                              >
                                +
                              </button>
                            ) : (
                              <div className="flex flex-col gap-1">
                                {cellStages.map((w) => (
                                  <button
                                    key={w.id}
                                    onClick={() => {
                                      setEditingStage(w)
                                      setStageProjectId(p.id)
                                      setStageDefaultCategory(undefined)
                                      setStageModalOpen(true)
                                    }}
                                    title={`${w.name || w.category}\nStatus: ${w.status}${w.targetDate ? `\nTarget: ${formatDate(w.targetDate)}` : ''}${w.remarks ? `\nRemarks: ${w.remarks}` : ''}`}
                                    className={`w-full text-left rounded border px-1.5 py-1 text-[11px] leading-tight transition-opacity hover:opacity-85 ${stagePillClass(w.status)}`}
                                  >
                                    <span className="font-semibold block truncate">{w.status}</span>
                                    {w.name && w.name !== w.category && (
                                      <span className="text-[10px] opacity-80 block truncate">{w.name}</span>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Analytics: Workload Line Chart + Product Status Donut Charts */}
      <div className="grid xl:grid-cols-2 gap-4 items-stretch">
        <Card
          title="Task Workload — Past 8 Weeks & Next 8 Weeks"
          action={<span className="text-xs text-slate-400">Product Tasks vs Side-Quest (* = Current WW)</span>}
          className="[&>div]:!p-3"
        >
          <div className="h-56 pointer-events-none select-none">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={workloadData} margin={{ top: 10, right: 16, left: -16, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#475569' }} interval={1} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#475569' }} />
                {currentWeekTick && <ReferenceLine x={currentWeekTick} stroke="#94a3b8" strokeDasharray="3 3" />}
                <Legend wrapperStyle={{ fontSize: '11px' }} />
                <Line type="monotone" dataKey="Product Tasks" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 3, fill: '#2563eb' }} activeDot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="Side-Quest Tasks" stroke="#8b5cf6" strokeWidth={2.5} dot={{ r: 3, fill: '#8b5cf6' }} activeDot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card title="Status Summary — Products & Side-Quest" className="[&>div]:!p-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">Products</span>
                <span className="text-[11px] font-medium text-slate-400">Total: {productProjects.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-36 w-32 shrink-0 pointer-events-none select-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={productChartData.length ? productChartData : [{ name: 'None', value: 1 }]} dataKey="value" nameKey="name" innerRadius={28} outerRadius={46} paddingAngle={2} isAnimationActive={false}>
                        {(productChartData.length ? productChartData : [{ name: 'None', value: 1 }]).map((d) => (
                          <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? '#e2e8f0'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <table className="w-full text-[11px]">
                  <thead><tr className="text-slate-400 border-b border-slate-200/70"><th className="py-1 text-left font-medium">Status</th><th className="py-1 text-right font-medium">Qty</th></tr></thead>
                  <tbody>
                    {productStatusRows.map((r) => (
                      <tr key={r.name} className="border-b last:border-b-0 border-slate-100">
                        <td className="py-1 flex items-center gap-1.5 text-slate-700 whitespace-nowrap"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[r.name] }} />{r.name}</td>
                        <td className="py-1 text-right font-semibold text-slate-800">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="rounded-md border border-slate-100 bg-slate-50/50 p-2.5">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-semibold text-slate-700">Side-Quest</span>
                <span className="text-[11px] font-medium text-slate-400">Total: {nonNpiProjects.length}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-36 w-32 shrink-0 pointer-events-none select-none">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={nonNpiChartData.length ? nonNpiChartData : [{ name: 'None', value: 1 }]} dataKey="value" nameKey="name" innerRadius={28} outerRadius={46} paddingAngle={2} isAnimationActive={false}>
                        {(nonNpiChartData.length ? nonNpiChartData : [{ name: 'None', value: 1 }]).map((d) => (
                          <Cell key={d.name} fill={STATUS_COLORS[d.name] ?? '#e2e8f0'} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <table className="w-full text-[11px]">
                  <thead><tr className="text-slate-400 border-b border-slate-200/70"><th className="py-1 text-left font-medium">Status</th><th className="py-1 text-right font-medium">Qty</th></tr></thead>
                  <tbody>
                    {nonNpiStatusRows.map((r) => (
                      <tr key={r.name} className="border-b last:border-b-0 border-slate-100">
                        <td className="py-1 flex items-center gap-1.5 text-slate-700 whitespace-nowrap"><span className="h-2 w-2 rounded-full shrink-0" style={{ background: STATUS_COLORS[r.name] }} />{r.name}</td>
                        <td className="py-1 text-right font-semibold text-slate-800">{r.value}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Bottom Row: Quick Pinboard + Recent Activities */}
      <div className="grid xl:grid-cols-2 gap-4 items-stretch">
        <Card title="Quick Pinboard" action={<StickyNote className="h-4 w-4 text-slate-400" />} className="[&>div]:!p-3">
          <div className="space-y-3">
            <form onSubmit={handleAddQuickNote} className="flex gap-2">
              <input
                type="text"
                value={newNoteText}
                onChange={(e) => setNewNoteText(e.target.value)}
                placeholder="Add a quick product follow-up note…"
                className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/30"
              />
              <Button type="submit" size="sm" variant="primary"><Plus className="h-3.5 w-3.5" /> Add</Button>
            </form>
            <ul className="divide-y divide-slate-100 max-h-56 overflow-y-auto pr-1">
              {quickNotes.length === 0 ? (
                <li className="py-8 text-center text-xs text-slate-400">No pinned notes yet.</li>
              ) : (
                quickNotes.map((note) => (
                  <li key={note.id} className="flex items-center justify-between gap-2 py-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setQuickNotes((prev) => prev.map((n) => (n.id === note.id ? { ...n, done: !n.done } : n)))}
                      className="flex items-center gap-2 min-w-0 text-left flex-1 hover:text-primary"
                    >
                      {note.done ? <CheckSquare className="h-4 w-4 text-emerald-600 shrink-0" /> : <Square className="h-4 w-4 text-slate-400 shrink-0" />}
                      <span className={note.done ? 'line-through text-slate-400 truncate' : 'text-slate-700 font-medium truncate'}>{note.text}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setQuickNotes((prev) => prev.filter((n) => n.id !== note.id))}
                      className="p-1 text-slate-400 hover:text-red-500 rounded"
                      title="Delete note"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))
              )}
            </ul>
          </div>
        </Card>

        <Card title={`Recent Activities (Latest ${latest15Logs.length})`} action={<span className="text-xs text-slate-400">Past 15 activities</span>} className="[&>div]:!p-3">
          {latest15Logs.length === 0 ? (
            <EmptyState title="No activity yet" />
          ) : (
            <ul className="divide-y divide-slate-100 max-h-72 overflow-y-auto pr-1">
              {latest15Logs.map((l) => (
                <li key={l.id} className="flex items-center justify-between gap-3 py-1.5 text-xs">
                  <span className="flex items-center gap-1.5 min-w-0">
                    <Badge color={l.action === 'Deleted' ? 'red' : l.action === 'Status Changed' ? 'blue' : 'grey'}>{l.action}</Badge>
                    <Badge color="violet">{l.entity}</Badge>
                    <span className="truncate text-slate-700">{l.message}</span>
                  </span>
                  <span className="text-[11px] text-slate-400 shrink-0">{formatDateTime(l.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <TaskForm open={taskModalOpen} task={editingTask} defaultDueDate={taskDefaultDueDate} variant="drawer" onClose={() => { setTaskModalOpen(false); setEditingTask(undefined); setTaskDefaultDueDate(undefined) }} />
      <MilestoneForm open={milestoneModalOpen} milestone={editingMilestone} variant="drawer" onClose={() => { setMilestoneModalOpen(false); setEditingMilestone(undefined) }} />
      <WorkstreamForm
        open={stageModalOpen}
        projectId={stageProjectId}
        workstream={editingStage}
        defaultCategory={stageDefaultCategory}
        onClose={() => { setStageModalOpen(false); setEditingStage(undefined) }}
      />
    </div>
  )
}
