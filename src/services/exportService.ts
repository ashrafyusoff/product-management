import * as XLSX from 'xlsx'
import { db } from '@/database/db'
import { isArchivedStatus, type Milestone, type Project, type Task, type Workstream } from '@/types'
import { todayStr } from '@/utils/helpers'
import { getIsoWeek, getMondayOfWeek, parseYmd, toYmd, addDays } from '@/features/overview/WorkWeekCalendar'
import { downloadBlob } from './backupService'

// Turns database records into readable spreadsheet rows (names instead of IDs).

type Row = Record<string, string | number>

async function lookups() {
  const [projects, workstreams, tasks] = await Promise.all([
    db.projects.toArray(), db.workstreams.toArray(), db.tasks.toArray(),
  ])
  const p = new Map(projects.map((x) => [x.id, `${x.name}${x.packageType ? ` (${x.packageType})` : ''}`]))
  const w = new Map(workstreams.map((x) => [x.id, x.name || x.category]))
  const t = new Map(tasks.map((x) => [x.id, x.name]))
  return {
    proj: (id: string) => p.get(id) ?? '',
    ws: (id: string) => w.get(id) ?? '',
    task: (id: string) => t.get(id) ?? '',
  }
}

export type ReportName = 'Projects' | 'Tasks' | 'Milestones' | 'Archived' | 'Recent Activities'
export const REPORT_NAMES: ReportName[] = ['Projects', 'Tasks', 'Milestones', 'Archived', 'Recent Activities']

export async function buildSheets(name: ReportName): Promise<Record<string, Row[]>> {
  const L = await lookups()
  switch (name) {
    case 'Projects': {
      const projects = await db.projects.toArray()
      const stages = await db.workstreams.toArray()
      return {
        Products: projects.map((p) => ({
          'Project Code': p.code, 'Product Name': p.name, 'Package Type': p.packageType,
          Priority: p.priority, Status: p.status, 'Progress %': p.progress, 'Start Date': p.startDate,
          'Target Date': p.baselineDate, Description: p.description,
        })),
        'Product Stages': stages.map((w) => ({
          Product: L.proj(w.projectId), Category: w.category, Stage: w.name || w.category,
          Status: w.status, 'Progress %': w.progress, 'Start Date': w.startDate, 'Target Date': w.targetDate, Remarks: w.remarks,
        })),
      }
    }
    case 'Tasks':
      return { Tasks: (await db.tasks.toArray()).map((t) => ({
        Task: t.name, Product: L.proj(t.projectId), Stage: L.ws(t.workstreamId),
        Start: t.startDate, Due: t.dueDate, 'Start Time': t.startTime ?? '', 'End Time': t.endTime ?? '',
        Completed: t.completionDate, Priority: t.priority, Status: t.status, 'Progress %': t.progress, Remarks: t.remarks })) }
    case 'Milestones':
      return { Milestones: (await db.milestones.toArray()).map((m) => ({
        Milestone: m.name, Product: L.proj(m.projectId), Stage: L.ws(m.workstreamId), Description: m.description,
        Target: m.targetDate, Actual: m.actualDate, Status: m.status, Remarks: m.remarks })) }
    case 'Archived': {
      const [allProjects, allStages, allTasks, allMilestones] = await Promise.all([
        db.projects.toArray(),
        db.workstreams.toArray(),
        db.tasks.toArray(),
        db.milestones.toArray(),
      ])
      const archivedProjects = allProjects.filter((p) => isArchivedStatus(p.status))
      const archivedIds = new Set(archivedProjects.map((p) => p.id))
      const stages = allStages.filter((w) => archivedIds.has(w.projectId))
      const tasks = allTasks.filter((t) => archivedIds.has(t.projectId))
      const milestones = allMilestones.filter((m) => archivedIds.has(m.projectId))

      return {
        'Archived Products': archivedProjects.map((p) => ({
          'Project Code': p.code,
          'Product Name': p.name,
          'Package Type': p.packageType,
          Priority: p.priority,
          Status: p.status,
          'Progress %': p.progress,
          'Start Date': p.startDate,
          'Target Date': p.baselineDate,
          Description: p.description,
        })),
        'Archived Stages': stages.map((w) => ({
          Product: L.proj(w.projectId),
          Category: w.category,
          Stage: w.name || w.category,
          Status: w.status,
          'Progress %': w.progress,
          'Start Date': w.startDate,
          'Target Date': w.targetDate,
          Remarks: w.remarks,
        })),
        'Archived Tasks': tasks.map((t) => ({
          Task: t.name,
          Product: L.proj(t.projectId),
          Stage: L.ws(t.workstreamId),
          Start: t.startDate,
          Due: t.dueDate,
          Completed: t.completionDate,
          Priority: t.priority,
          Status: t.status,
          'Progress %': t.progress,
          Remarks: t.remarks,
        })),
        'Archived Milestones': milestones.map((m) => ({
          Milestone: m.name,
          Product: L.proj(m.projectId),
          Description: m.description,
          Target: m.targetDate,
          Actual: m.actualDate,
          Status: m.status,
          Remarks: m.remarks,
        })),
      }
    }
    case 'Recent Activities': {
      const logs = (await db.activityLogs.toArray()).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      return {
        'Recent Activities': logs.map((l) => ({
          'Date & Time': new Date(l.createdAt).toLocaleString('en-GB'),
          Action: l.action,
          Entity: l.entity,
          Product: L.proj(l.projectId),
          Description: l.message,
        })),
      }
    }
  }
}

/**
 * Automatically calculates and sets SheetJS (`!cols`) column widths (`wch`)
 * based on the longest header or cell value in each column plus safety padding.
 */
export function autoFitColumns(ws: XLSX.WorkSheet, rows: Row[], padding = 4) {
  const effectiveRows = rows.length ? rows : [{ Info: 'No records' }]
  const headers: string[] = []
  const seen = new Set<string>()
  for (const row of effectiveRows) {
    for (const key of Object.keys(row)) {
      if (!seen.has(key)) {
        seen.add(key)
        headers.push(key)
      }
    }
  }

  ws['!cols'] = headers.map((header) => {
    let maxLen = header.length
    for (const row of effectiveRows) {
      const raw = row[header]
      if (raw === null || raw === undefined) continue
      const lines = String(raw).split(/\r?\n/)
      for (const line of lines) {
        if (line.length > maxLen) maxLen = line.length
      }
    }
    return { wch: Math.max(10, maxLen + padding) }
  })
}

function writeWorkbook(sheets: Record<string, Row[]>, filename: string) {
  const wb = XLSX.utils.book_new()
  for (const [name, rows] of Object.entries(sheets)) {
    const effectiveRows = rows.length ? rows : [{ Info: 'No records' }]
    // An empty sheet still gets a placeholder so Excel opens the file.
    const ws = XLSX.utils.json_to_sheet(effectiveRows)
    autoFitColumns(ws, effectiveRows)
    XLSX.utils.book_append_sheet(wb, ws, name.slice(0, 31))
  }
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })
  downloadBlob(new Blob([out], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), filename)
}

const stamp = () => new Date().toISOString().slice(0, 10)

export async function exportReport(name: ReportName) {
  writeWorkbook(await buildSheets(name), `npi-${name.toLowerCase().replace(/\s+/g, '-')}-${stamp()}.xlsx`)
}

export async function exportAllReports() {
  const all: Record<string, Row[]> = {}
  for (const n of REPORT_NAMES) Object.assign(all, await buildSheets(n))
  writeWorkbook(all, `npi-all-reports-${stamp()}.xlsx`)
}

interface GanttExportRow {
  category: 'Product' | 'Stage' | 'Milestone' | 'Task'
  label: string
  sublabel: string
  status: string
  progress: number
  startDate: string
  endDate: string
  isPoint?: boolean
}

function buildGanttExportData(
  project: Project,
  stages: Workstream[],
  milestones: Milestone[],
  tasks: Task[],
) {
  const today = todayStr()
  const projStart = project.startDate || project.createdAt?.slice(0, 10) || today
  const projEnd = project.baselineDate && project.baselineDate >= projStart ? project.baselineDate : projStart

  const items: GanttExportRow[] = [
    {
      category: 'Product',
      label: `${project.name}${project.packageType ? ` · ${project.packageType}` : ''}`,
      sublabel: project.code,
      status: project.status,
      progress: project.progress,
      startDate: projStart,
      endDate: projEnd,
    },
  ]

  for (const w of stages) {
    const dStart = w.startDate || projStart
    const dEndRaw = w.actualDate || w.targetDate || projEnd
    const dEnd = dEndRaw >= dStart ? dEndRaw : dStart
    items.push({
      category: 'Stage',
      label: `├─ ${w.category}${w.name && w.name !== w.category ? `: ${w.name}` : ''}`,
      sublabel: w.remarks || w.category,
      status: w.status,
      progress: w.progress,
      startDate: dStart,
      endDate: dEnd,
    })
  }

  for (const m of [...milestones].sort((a, b) => (a.targetDate || '9999').localeCompare(b.targetDate || '9999'))) {
    const mDate = m.actualDate || m.targetDate || projEnd
    items.push({
      category: 'Milestone',
      label: `◆ ${m.name}`,
      sublabel: m.description || 'NPI Milestone',
      status: m.status,
      progress: m.status === 'Completed' ? 100 : 0,
      startDate: mDate,
      endDate: mDate,
      isPoint: true,
    })
  }

  for (const t of [...tasks].sort((a, b) => (a.startDate || a.dueDate || '9999').localeCompare(b.startDate || b.dueDate || '9999'))) {
    const tStart = t.startDate || t.dueDate || projStart
    const tEndRaw = t.dueDate || t.completionDate || tStart
    const tEnd = tEndRaw >= tStart ? tEndRaw : tStart
    items.push({
      category: 'Task',
      label: `• ${t.name}`,
      sublabel: `Priority: ${t.priority}`,
      status: t.status,
      progress: t.progress,
      startDate: tStart,
      endDate: tEnd,
    })
  }

  // Build weekly timeline columns covering the span of all items (capped at 26 weeks for readability)
  const validDates = items.flatMap((i) => [i.startDate, i.endDate]).filter(Boolean).sort()
  const minYmd = validDates[0] || today
  const maxYmd = validDates[validDates.length - 1] || today
  const firstMonday = getMondayOfWeek(parseYmd(minYmd))
  const lastMonday = getMondayOfWeek(parseYmd(maxYmd))

  const weeks: { label: string; startYmd: string; endYmd: string }[] = []
  let cur = firstMonday
  while (cur <= lastMonday && weeks.length < 26) {
    const ww = getIsoWeek(cur)
    const startYmd = toYmd(cur)
    const endYmd = toYmd(addDays(cur, 6))
    const shortDate = cur.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
    weeks.push({ label: `WW${String(ww).padStart(2, '0')} (${shortDate})`, startYmd, endYmd })
    cur = addDays(cur, 7)
  }

  const sheetRows: Row[] = items.map((item) => {
    const row: Row = {
      'Item / Track': item.label,
      Type: item.category,
      Details: item.sublabel,
      Status: item.status,
      'Progress %': item.progress,
      'Start Date': item.startDate,
      'Target / End Date': item.endDate,
    }
    for (const w of weeks) {
      const overlaps = item.startDate <= w.endYmd && item.endDate >= w.startYmd
      row[w.label] = overlaps ? (item.isPoint ? '   ◆   ' : '████████') : ''
    }
    return row
  })

  return { items, sheetRows }
}

export function exportProjectGanttPng(project: Project, items: GanttExportRow[]) {
  if (typeof document === 'undefined') return
  const canvas = document.createElement('canvas')
  const width = 1280
  const headerH = 88
  const rowH = 42
  const footerH = 36
  const height = headerH + items.length * rowH + footerH
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) return

  // Background
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)

  // Title banner
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, 48)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 16px Inter, system-ui, sans-serif'
  ctx.fillText(`${project.name}${project.packageType ? ` · ${project.packageType}` : ''} [${project.code}] — Master Gantt Chart`, 20, 30)

  const leftColsW = 470
  const chartX = leftColsW
  const chartW = width - leftColsW - 24

  const today = todayStr()
  const toMs = (s: string) => new Date(s).getTime()
  const DAY = 86400000
  const allMs = [...items.flatMap((i) => [toMs(i.startDate), toMs(i.endDate)]), toMs(today)].filter((n) => !isNaN(n))
  const rawMin = Math.min(...allMs)
  const rawMax = Math.max(...allMs)
  const span = Math.max(rawMax - rawMin, 14 * DAY)
  const minMs = rawMin - Math.max(3 * DAY, Math.round(span * 0.05))
  const maxMs = rawMax + Math.max(5 * DAY, Math.round(span * 0.07))
  const totalMs = Math.max(maxMs - minMs, DAY)
  const xOf = (dStr: string) => chartX + Math.max(0, Math.min(1, (toMs(dStr) - minMs) / totalMs)) * chartW

  // Column Header Bar
  ctx.fillStyle = '#f1f5f9'
  ctx.fillRect(0, 48, width, 40)
  ctx.strokeStyle = '#cbd5e1'
  ctx.beginPath()
  ctx.moveTo(0, 88)
  ctx.lineTo(width, 88)
  ctx.stroke()

  ctx.fillStyle = '#334155'
  ctx.font = 'bold 12px Inter, system-ui, sans-serif'
  ctx.fillText('Item / Track', 16, 73)
  ctx.fillText('Status', 310, 73)

  // Date ticks
  const tickCount = 8
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.fillStyle = '#64748b'
  for (let i = 0; i <= tickCount; i++) {
    const tMs = minMs + (totalMs * i) / tickCount
    const tx = chartX + (i / tickCount) * chartW
    const lbl = new Date(tMs).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: '2-digit' })
    ctx.fillText(lbl, tx - 24, 73)
    ctx.strokeStyle = '#e2e8f0'
    ctx.beginPath()
    ctx.moveTo(tx, 88)
    ctx.lineTo(tx, height - footerH)
    ctx.stroke()
  }

  // Rows
  items.forEach((item, idx) => {
    const y = headerH + idx * rowH
    if (idx % 2 === 1) {
      ctx.fillStyle = '#f8fafc'
      ctx.fillRect(0, y, leftColsW, rowH)
    }
    ctx.strokeStyle = '#f1f5f9'
    ctx.beginPath()
    ctx.moveTo(0, y + rowH)
    ctx.lineTo(width, y + rowH)
    ctx.stroke()

    ctx.fillStyle = item.category === 'Product' ? '#1e3a8a' : '#1e293b'
    ctx.font = item.category === 'Product' ? 'bold 12px Inter, system-ui, sans-serif' : '12px Inter, system-ui, sans-serif'
    ctx.fillText(item.label.slice(0, 38), 16, y + 20)

    ctx.fillStyle = '#64748b'
    ctx.font = '10px Inter, system-ui, sans-serif'
    ctx.fillText(`${item.startDate} → ${item.endDate}`, 16, y + 34)

    ctx.fillStyle = '#334155'
    ctx.font = '11px Inter, system-ui, sans-serif'
    ctx.fillText(`${item.status.slice(0, 18)} (${item.progress}%)`, 310, y + 25)

    // Bar or Diamond
    const x1 = xOf(item.startDate)
    const x2 = xOf(item.endDate)
    const color =
      item.status.includes('Completed') || item.status.includes('Delivered')
        ? '#10b981'
        : item.status.includes('Delayed')
          ? '#ef4444'
          : item.category === 'Product'
            ? '#2563eb'
            : item.category === 'Stage'
              ? '#6366f1'
              : item.category === 'Milestone'
                ? '#f59e0b'
                : '#0ea5e9'

    if (item.isPoint) {
      const cy = y + rowH / 2
      ctx.save()
      ctx.translate(x1, cy)
      ctx.rotate(Math.PI / 4)
      ctx.fillStyle = color
      ctx.fillRect(-6, -6, 12, 12)
      ctx.restore()
    } else {
      const barW = Math.max(x2 - x1, 10)
      const barY = y + 12
      const barH = 18
      ctx.fillStyle = color
      ctx.globalAlpha = 0.85
      ctx.fillRect(x1, barY, barW, barH)
      ctx.globalAlpha = 1
      if (item.progress > 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.22)'
        ctx.fillRect(x1, barY, (barW * Math.min(100, item.progress)) / 100, barH)
      }
    }
  })

  // Today line
  const todayX = xOf(today)
  ctx.strokeStyle = '#ef4444'
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(todayX, 88)
  ctx.lineTo(todayX, height - footerH)
  ctx.stroke()
  ctx.lineWidth = 1

  // Footer
  ctx.fillStyle = '#64748b'
  ctx.font = '11px Inter, system-ui, sans-serif'
  ctx.fillText(`Exported on ${today} · Red vertical line = Today`, 16, height - 12)

  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, `npi-hrs-${project.code}-gantt-${stamp()}.png`)
  }, 'image/png')
}

export async function exportSingleProjectReport(projectId: string) {
  const [project, stages, tasks, milestones, logs] = await Promise.all([
    db.projects.get(projectId),
    db.workstreams.where('projectId').equals(projectId).toArray(),
    db.tasks.where('projectId').equals(projectId).toArray(),
    db.milestones.where('projectId').equals(projectId).toArray(),
    db.activityLogs.where('projectId').equals(projectId).toArray(),
  ])
  if (!project) return

  const wsMap = new Map(stages.map((w) => [w.id, w.name || w.category]))
  const wsName = (id: string) => wsMap.get(id) ?? ''

  const ganttData = buildGanttExportData(project, stages, milestones, tasks)

  const sheets: Record<string, Row[]> = {
    'Product Overview': [
      {
        'Project Code': project.code,
        'Product Name': project.name,
        'Package Type': project.packageType,
        Priority: project.priority,
        Status: project.status,
        'Progress %': project.progress,
        'Start Date': project.startDate,
        'Target Date': project.baselineDate,
        Description: project.description,
      },
    ],
    'Gantt Chart': ganttData.sheetRows,
    'Product Stages': stages.map((w) => ({
      'Project Code': project.code,
      Product: project.name,
      Category: w.category,
      Stage: w.name || w.category,
      Status: w.status,
      'Progress %': w.progress,
      'Start Date': w.startDate,
      'Target Date': w.targetDate,
      'Actual Date': w.actualDate,
      Remarks: w.remarks,
    })),
    Tasks: tasks.map((t) => ({
      Task: t.name,
      Product: project.name,
      Stage: wsName(t.workstreamId),
      Start: t.startDate,
      Due: t.dueDate,
      Completed: t.completionDate,
      Priority: t.priority,
      Status: t.status,
      Remarks: t.remarks,
    })),
    Milestones: milestones.map((m) => ({
      Milestone: m.name,
      Product: project.name,
      Description: m.description,
      Target: m.targetDate,
      Actual: m.actualDate,
      Status: m.status,
      Remarks: m.remarks,
    })),
    'Activity History': [...logs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((l) => ({
        'Date & Time': new Date(l.createdAt).toLocaleString('en-GB'),
        Action: l.action,
        Entity: l.entity === 'Workstream' ? 'Stage' : l.entity,
        Description: l.message,
      })),
  }

  writeWorkbook(sheets, `pm-${project.code}-${stamp()}.xlsx`)
  exportProjectGanttPng(project, ganttData.items)
}
