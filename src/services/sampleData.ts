import { db } from '@/database/db'
import type { Milestone, Project, StageStatus, Task, Workstream } from '@/types'
import { newId, nowIso } from '@/utils/helpers'

// Creates original Product Management demo data.
// Every record gets `isSample: true` so "Clear Sample Data" only removes demo data.

function daysFromNow(offset: number): string {
  const x = new Date()
  x.setDate(x.getDate() + offset)
  const y = x.getFullYear()
  const m = String(x.getMonth() + 1).padStart(2, '0')
  const day = String(x.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export async function loadSampleData() {
  const existing = await db.projects.count()
  if (existing > 0) throw new Error('Database already contains data. Clear or reset before loading sample data.')

  const now = nowIso()
  const base = () => ({ id: newId(), isSample: true as const, createdAt: now, updatedAt: now })
  const d = (offset: number) => daysFromNow(offset)

  // ---------- 1. Products (Fictional Product Name + Package Type) & Non-NPI Work ----------
  const pAxon: Project = {
    ...base(),
    code: 'PM-101',
    name: 'AXON-400',
    packageType: '48-QFN-EP',
    description: 'High-volume industrial controller qualification, PPAP, PCN rollout, and OB conversion.',
    objectives: 'Complete Safe Launch 10-lot closure, CMT release, and OB conversion readiness.',
    priority: 'Critical',
    status: 'In Progress',
    startDate: d(-60),
    baselineDate: d(42),
    revisedDate: '',
    actualDate: '',
    progress: 70,
    remarks: 'Qualification and PPAP complete; Safe Launch and CMT in final review.',
  }

  const pVectra: Project = {
    ...base(),
    code: 'PM-102',
    name: 'VECTRA-M7',
    packageType: '144-BGA-TP',
    description: 'Dual-site transfer for VECTRA-M7 144-BGA-TP covering Qual, Sample, PCN, and PN Setup.',
    objectives: 'Finalize PCN waiver, complete SAP/ARAS PN setup, and align Safe Launch schedule.',
    priority: 'Critical',
    status: 'In Progress',
    startDate: d(-48),
    baselineDate: d(58),
    revisedDate: d(72),
    actualDate: '',
    progress: 50,
    remarks: 'Monitoring sample lot readiness and PCN approval.',
  }

  const pHelios: Project = {
    ...base(),
    code: 'PM-103',
    name: 'HELIOS-X2',
    packageType: '64-TSSOP',
    description: 'HELIOS-X2 64-TSSOP customer sample build, PPAP compilation, PCN initiation, and PN setup.',
    objectives: 'Deliver customer samples, release PPAP package, and complete PN activation.',
    priority: 'High',
    status: 'In Progress',
    startDate: d(-40),
    baselineDate: d(35),
    revisedDate: '',
    actualDate: '',
    progress: 60,
    remarks: 'PPAP data collection on track; awaiting sample lot allocation.',
  }

  const pPulse: Project = {
    ...base(),
    code: 'PM-104',
    name: 'PULSE-210',
    packageType: '32-DFN-S',
    description: 'PULSE-210 32-DFN-S Safe Launch lot disposition, CMT closure, and OB conversion.',
    objectives: 'Close Safe Launch batch 2, finalize CMT sign-off, and enable Q1 OB conversion.',
    priority: 'High',
    status: 'Delayed',
    startDate: d(-55),
    baselineDate: d(20),
    revisedDate: d(38),
    actualDate: '',
    progress: 60,
    remarks: 'Batch 2 SL lot targeting completion this week; CMT closure pending.',
  }

  const pOrbit: Project = {
    ...base(),
    code: 'PM-105',
    name: 'ORBIT-90',
    packageType: '100-TQFP',
    description: 'ORBIT-90 100-TQFP PPAP release, Safe Launch closure, and OB conversion.',
    objectives: 'Complete final Safe Launch review and confirm customer demand for OB conversion.',
    priority: 'Medium',
    status: 'In Progress',
    startDate: d(-35),
    baselineDate: d(50),
    revisedDate: '',
    actualDate: '',
    progress: 55,
    remarks: 'PPAP approved; Safe Launch review scheduled.',
  }

  const pNova: Project = {
    ...base(),
    code: 'PM-106',
    name: 'NOVA-12',
    packageType: '80-LGA',
    description: 'NOVA-12 80-LGA Steering Committee scope alignment, PCN strategy, and PPAP planning.',
    objectives: 'Secure SC approval, align PCN strategy, and lock 3-month Qual + PPAP plan.',
    priority: 'High',
    status: 'Planning',
    startDate: d(-20),
    baselineDate: d(85),
    revisedDate: '',
    actualDate: '',
    progress: 25,
    remarks: 'Pending Steering Committee sign-off.',
  }

  const pZenith: Project = {
    ...base(),
    code: 'PM-107',
    name: 'ZENITH-G5',
    packageType: '256-FBGA',
    description: 'ZENITH-G5 256-FBGA extended-temp qualification, sample build planning, and PN setup.',
    objectives: 'Confirm wafer lot availability and finalize concept PN setup.',
    priority: 'Medium',
    status: 'In Progress',
    startDate: d(-28),
    baselineDate: d(95),
    revisedDate: '',
    actualDate: '',
    progress: 35,
    remarks: 'Checking wafer inventory and extended temperature spec.',
  }

  const pTitan: Project = {
    ...base(),
    code: 'PM-108',
    name: 'TITAN-88',
    packageType: '20-SOIC',
    description: 'TITAN-88 20-SOIC full product lifecycle transfer completed through OB conversion.',
    objectives: 'Complete Qual, PPAP, PCN, Safe Launch, and PN Setup.',
    priority: 'Low',
    status: 'Completed',
    startDate: d(-120),
    baselineDate: d(-15),
    revisedDate: '',
    actualDate: d(-18),
    progress: 100,
    remarks: 'All product stages completed and closed.',
  }

  // Non-NPI / Operational Improvement Work
  const autoWork: Project = {
    ...base(),
    code: 'AUTO-01',
    name: 'Die Inventory & Outlook Sync Automation',
    packageType: 'Internal Tooling',
    isNonNpi: true,
    nonNpiCategory: 'Automation / Tooling',
    description: 'Automate weekly wafer die quantity checks and Outlook action item tracking.',
    objectives: 'Eliminate manual spreadsheet reconciliation across product stages.',
    priority: 'Medium',
    status: 'In Progress',
    startDate: d(-25),
    baselineDate: d(25),
    revisedDate: '',
    actualDate: '',
    progress: 60,
    remarks: 'Prototype running; adding automated weekly lot-type alert.',
  }

  const procWork: Project = {
    ...base(),
    code: 'IMP-01',
    name: 'PCN & PPAP Readiness Checklist',
    packageType: 'Process Standard',
    isNonNpi: true,
    nonNpiCategory: 'Process Improvement',
    description: 'Standardize PCN, PPAP, and Safe Launch gate criteria across product families.',
    objectives: 'Reduce review board cycle time by 20%.',
    priority: 'High',
    status: 'In Progress',
    startDate: d(-30),
    baselineDate: d(15),
    revisedDate: '',
    actualDate: '',
    progress: 75,
    remarks: 'Template reviewed with Product Engineering and Quality leads.',
  }

  const projects = [pAxon, pVectra, pHelios, pPulse, pOrbit, pNova, pZenith, pTitan, autoWork, procWork]

  // ---------- 2. Product Stages (Qual, Sample, PPAP, PCN, Safe Launch, CMT, OB conversion, PN Setup) ----------
  const orderByProj = new Map<string, number>()
  const st = (
    projectId: string,
    category: Workstream['category'],
    status: StageStatus,
    progress: number,
    sOff: number,
    tOff: number,
    remarks: string,
    actualOff?: number,
  ): Workstream => {
    const nextOrder = (orderByProj.get(projectId) ?? -1) + 1
    orderByProj.set(projectId, nextOrder)
    return {
      ...base(),
      projectId,
      category,
      name: category,
      status,
      progress,
      order: nextOrder,
      startDate: d(sOff),
      targetDate: d(tOff),
      actualDate: actualOff !== undefined ? d(actualOff) : status === 'Done' ? d(tOff) : '',
      remarks,
    }
  }

  const workstreams: Workstream[] = [
    // AXON-400 (48-QFN-EP)
    st(pAxon.id, 'Qual', 'Done', 100, -60, -25, 'Qual report approved by review board.', -26),
    st(pAxon.id, 'Sample', 'Done', 100, -45, -18, 'Samples shipped to customer.', -19),
    st(pAxon.id, 'PPAP', 'Done', 100, -40, -14, 'PPAP package approved & released.', -14),
    st(pAxon.id, 'PCN', 'Done', 100, -35, -10, 'PCN distributed to all impacted customers.', -10),
    st(pAxon.id, 'Safe Launch', 'On Track', 80, -20, 7, '10-lot Safe Launch tracking on schedule.'),
    st(pAxon.id, 'CMT', 'Watch', 85, -30, 5, 'CMT in Ready for Release; verify final sign-off.'),
    st(pAxon.id, 'OB conversion', 'On Track', 60, -10, 21, 'Capacity & OAI flags aligned with planning.'),
    st(pAxon.id, 'PN Setup', 'Done', 100, -50, -20, 'All production PNs active in ERP.', -21),

    // VECTRA-M7 (144-BGA-TP)
    st(pVectra.id, 'Qual', 'On Track', 70, -45, 14, 'Reliability stress testing ongoing.'),
    st(pVectra.id, 'Sample', 'Risk', 40, -20, 10, 'Sample build pending assembly capacity slot.'),
    st(pVectra.id, 'PCN', 'Urgent', 60, -25, 4, 'PCN waiver approval required this week.'),
    st(pVectra.id, 'Safe Launch', 'Watch', 35, -10, 28, 'Confirm 10-lot SL size & lead time.'),
    st(pVectra.id, 'PN Setup', 'On Track', 75, -15, 6, 'PN list submitted for MDM setup.'),

    // HELIOS-X2 (64-TSSOP)
    st(pHelios.id, 'Sample', 'Risk', 45, -30, 8, 'Pending die allocation for sample build.'),
    st(pHelios.id, 'PPAP', 'On Track', 70, -25, 12, 'Data upload ongoing; prioritizing 64-TSSOP.'),
    st(pHelios.id, 'PCN', 'Watch', 50, -18, 16, 'PCN initiated; awaiting sample PN list.'),
    st(pHelios.id, 'PN Setup', 'Done', 100, -35, -5, 'OAI & RFS ECO approved & implemented.', -6),

    // PULSE-210 (32-DFN-S)
    st(pPulse.id, 'Qual', 'Done', 100, -55, -20, 'Qualification complete.', -20),
    st(pPulse.id, 'Safe Launch', 'Urgent', 65, -30, 3, 'Batch 2 SL targeting closure this week.'),
    st(pPulse.id, 'CMT', 'Risk', 55, -25, 7, 'Waiting for final test & FA data to close CMT.'),
    st(pPulse.id, 'OB conversion', 'Watch', 40, -10, 35, 'Customer RMAD scheduled; close SL first.'),

    // ORBIT-90 (100-TQFP)
    st(pOrbit.id, 'PPAP', 'Done', 100, -35, -4, 'PPAP approved.', -4),
    st(pOrbit.id, 'Safe Launch', 'On Track', 75, -25, 12, 'TRB approval & SL closure pending.'),
    st(pOrbit.id, 'OB conversion', 'Not Started', 10, 0, 50, 'Confirm customer demand before OB switch.'),

    // NOVA-12 (80-LGA)
    st(pNova.id, 'Qual', 'Watch', 30, -20, 30, 'Pending SC approval & 80-LGA scope alignment.'),
    st(pNova.id, 'PCN', 'Not Started', 15, -5, 45, 'Align PCN strategy after SC approval.'),
    st(pNova.id, 'PPAP', 'Not Started', 0, 10, 75, 'Backtrack from SOP target.'),

    // ZENITH-G5 (256-FBGA)
    st(pZenith.id, 'Qual', 'Watch', 40, -28, 35, 'Confirm mask set & wafer availability.'),
    st(pZenith.id, 'Sample', 'Not Started', 15, 0, 55, 'Awaiting wafer lot confirmation.'),
    st(pZenith.id, 'PN Setup', 'On Track', 50, -15, 20, 'Concept CMT & PN draft under review.'),

    // TITAN-88 (20-SOIC)
    st(pTitan.id, 'Qual', 'Done', 100, -120, -70, 'Completed.', -72),
    st(pTitan.id, 'PPAP', 'Done', 100, -80, -45, 'Completed.', -46),
    st(pTitan.id, 'PCN', 'Done', 100, -60, -30, 'Completed.', -31),
    st(pTitan.id, 'OB conversion', 'Done', 100, -35, -15, 'Completed.', -18),
  ]

  // ---------- 3. Tasks (with varied workday hours for Outlook 1-Week Hourly View) ----------
  const TIME_SLOTS: readonly [string, string][] = [
    ['08:30', '10:00'],
    ['09:00', '10:30'],
    ['10:00', '11:30'],
    ['11:00', '12:00'],
    ['13:00', '14:30'],
    ['14:00', '16:00'],
    ['15:00', '16:30'],
    ['16:00', '17:30'],
    ['09:30', '11:00'],
    ['13:30', '15:00'],
  ]
  let slotIdx = 0
  const task = (
    projectId: string,
    workstreamId: string,
    name: string,
    s: number,
    due: number,
    priority: Task['priority'],
    status: Task['status'],
    progress: number,
  ): Task => {
    const [startTime, endTime] = TIME_SLOTS[(slotIdx++ * 3) % TIME_SLOTS.length]
    return {
      ...base(),
      projectId,
      workstreamId,
      name,
      assignee: 'Me',
      startDate: d(s),
      dueDate: d(due),
      startTime,
      endTime,
      completionDate: status === 'Completed' ? d(due) : '',
      priority,
      status,
      progress,
      remarks: '',
    }
  }

  const ws = (projId: string, cat: string) =>
    workstreams.find((w) => w.projectId === projId && w.category === cat)?.id ?? ''

  const tasks: Task[] = [
    // Past weeks completed tasks
    task(pAxon.id, ws(pAxon.id, 'Qual'), 'Close AXON-400 Qual review board action items', -32, -26, 'High', 'Completed', 100),
    task(pAxon.id, ws(pAxon.id, 'PPAP'), 'Submit AXON-400 PPAP package for sign-off', -22, -15, 'High', 'Completed', 100),
    task(pHelios.id, ws(pHelios.id, 'PN Setup'), 'Verify HELIOS-X2 OAI & RFS activation', -18, -8, 'Medium', 'Completed', 100),
    task(pOrbit.id, ws(pOrbit.id, 'PPAP'), 'Review PE comments on ORBIT-90 PPAP', -12, -5, 'High', 'Completed', 100),

    // Current week tasks (Mon-Fri spread with distinct hours)
    task(pVectra.id, ws(pVectra.id, 'PCN'), 'Initiate VECTRA-M7 PCN non-block waiver', -5, 0, 'Critical', 'In Progress', 60),
    task(pPulse.id, ws(pPulse.id, 'Safe Launch'), 'Follow up PULSE-210 batch 2 SL lot disposition', -4, 0, 'Critical', 'In Progress', 70),
    task(pAxon.id, ws(pAxon.id, 'CMT'), 'Verify AXON-400 CMT Ready-for-Release status', -3, 1, 'High', 'Under Review', 85),
    task(pVectra.id, ws(pVectra.id, 'PN Setup'), 'Confirm MDM PN setup & lead time with planning', -2, 1, 'High', 'In Progress', 50),
    task(pHelios.id, ws(pHelios.id, 'Sample'), 'Escalate die allocation for HELIOS-X2 sample build', -2, 2, 'High', 'In Progress', 40),
    task(pNova.id, ws(pNova.id, 'Qual'), 'Prepare Steering Committee slides & PPAP plan', -1, 2, 'High', 'In Progress', 50),
    task(autoWork.id, '', 'Validate automated wafer lot-type alert script', -1, 3, 'Medium', 'In Progress', 65),
    task(pZenith.id, ws(pZenith.id, 'Qual'), 'Confirm ZENITH-G5 mask set & extended-temp spec', 0, 3, 'Medium', 'In Progress', 40),
    task(procWork.id, '', 'Finalize unified PCN & Safe Launch gate checklist', -2, 4, 'High', 'Under Review', 80),

    // Upcoming weeks
    task(pPulse.id, ws(pPulse.id, 'CMT'), 'Close PULSE-210 SL CAB & update CMT status', 2, 7, 'Critical', 'Not Started', 0),
    task(pVectra.id, ws(pVectra.id, 'Safe Launch'), 'Align 10-lot Safe Launch schedule with ops', 4, 10, 'High', 'Not Started', 0),
    task(pOrbit.id, ws(pOrbit.id, 'OB conversion'), 'Confirm Q1 customer demand for ORBIT-90 OB', 5, 14, 'Medium', 'Not Started', 0),
    task(pHelios.id, ws(pHelios.id, 'PCN'), 'Review PCN distribution list & sample qty', 7, 16, 'High', 'Not Started', 0),
    task(pAxon.id, ws(pAxon.id, 'OB conversion'), 'Sign off AXON-400 OB conversion readiness', 10, 21, 'High', 'Not Started', 0),
    task(pNova.id, ws(pNova.id, 'PCN'), 'Create PCN rollout schedule after SC approval', 14, 28, 'Medium', 'Not Started', 0),
  ]

  // ---------- 4. Milestones ----------
  const ms = (
    projectId: string,
    workstreamId: string,
    name: string,
    description: string,
    target: number,
    status: Milestone['status'],
    actual = '',
  ): Milestone => ({
    ...base(),
    projectId,
    workstreamId,
    name,
    description,
    targetDate: d(target),
    actualDate: actual,
    status,
    remarks: '',
  })

  const milestones: Milestone[] = [
    ms(pAxon.id, ws(pAxon.id, 'PCN'), 'AXON-400 PCN Distributed', 'Customer PCN issued', -10, 'Completed', d(-10)),
    ms(pAxon.id, ws(pAxon.id, 'Safe Launch'), 'AXON-400 Safe Launch CAB Closure', 'Close 10-lot SL & MDR', 7, 'In Progress'),
    ms(pVectra.id, ws(pVectra.id, 'PCN'), 'VECTRA-M7 Non-Block Waiver Approved', 'Waiver sign-off for BOM', 4, 'Delayed'),
    ms(pPulse.id, ws(pPulse.id, 'Safe Launch'), 'PULSE-210 Batch 2 SL Lot Out', 'Target SL completion', 3, 'In Progress'),
    ms(pHelios.id, ws(pHelios.id, 'PPAP'), 'HELIOS-X2 PPAP Release', 'Customer PPAP package sign-off', 12, 'In Progress'),
    ms(pNova.id, ws(pNova.id, 'Qual'), 'NOVA-12 Steering Committee Gate', 'SC approval for qual & PCN plan', 18, 'Not Started'),
  ]

  // ---------- 5. Activity Logs ----------
  const logs = [
    { ...base(), entity: 'Stage', entityId: ws(pAxon.id, 'CMT'), projectId: pAxon.id, action: 'Status Changed' as const, message: 'AXON-400 (48-QFN-EP) CMT updated to Watch' },
    { ...base(), entity: 'Stage', entityId: ws(pVectra.id, 'PCN'), projectId: pVectra.id, action: 'Updated' as const, message: 'VECTRA-M7 (144-BGA-TP) PCN non-block waiver initiated' },
    { ...base(), entity: 'Stage', entityId: ws(pPulse.id, 'Safe Launch'), projectId: pPulse.id, action: 'Updated' as const, message: 'PULSE-210 (32-DFN-S) Safe Launch batch 2 in progress' },
    { ...base(), entity: 'Milestone', entityId: milestones[0].id, projectId: pAxon.id, action: 'Status Changed' as const, message: 'AXON-400 PCN Distributed completed' },
  ]

  await db.transaction('rw', [db.projects, db.workstreams, db.tasks, db.milestones, db.activityLogs], async () => {
    await db.projects.bulkAdd(projects)
    await db.workstreams.bulkAdd(workstreams)
    await db.tasks.bulkAdd(tasks)
    await db.milestones.bulkAdd(milestones)
    await db.activityLogs.bulkAdd(logs)
  })
}

export async function hasSampleData(): Promise<boolean> {
  const rows = await db.projects.toArray()
  return rows.some((r) => !!r.isSample)
}

export async function clearSampleData() {
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) {
      await t.filter((r: { isSample?: boolean }) => !!r.isSample).delete()
    }
  })
}
