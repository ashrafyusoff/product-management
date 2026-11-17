import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ChevronRight, FolderKanban, ListChecks, Moon, Plus, Search, Settings, Sun } from 'lucide-react'
import { useTable } from '@/hooks/useTable'
import { useTheme } from '@/hooks/useTheme'
import type { Project, Task } from '@/types'
import { NAV_ITEMS } from './Sidebar'
import { Button } from '@/components/ui'

export function TopBar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const { isDark, toggleTheme } = useTheme()
  const projects = useTable<Project>('projects')
  const activeProj = projects?.find((p) => pathname === `/projects/${p.id}`)
  const projectName = activeProj ? `${activeProj.name}${activeProj.packageType ? ` · ${activeProj.packageType}` : ''}` : undefined
  const tasks = useTable<Task>('tasks')
  const [query, setQuery] = useState('')
  const [quickOpen, setQuickOpen] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)

  // Close dropdowns when clicking elsewhere
  useEffect(() => {
    const close = (e: MouseEvent) => { if (!boxRef.current?.contains(e.target as Node)) { setQuickOpen(false); setQuery('') } }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [])

  const section = NAV_ITEMS.find((n) => (n.end ? pathname === n.to : pathname.startsWith(n.to))) ?? NAV_ITEMS[0]
  const isDetail = pathname.startsWith('/projects/')

  const q = query.trim().toLowerCase()
  const projectHits = q ? (projects ?? []).filter((p) => `${p.code} ${p.name} ${p.packageType ?? ''}`.toLowerCase().includes(q)).slice(0, 5) : []
  const taskHits = q ? (tasks ?? []).filter((t) => `${t.name} ${t.assignee}`.toLowerCase().includes(q)).slice(0, 5) : []
  const totalHits = projectHits.length + taskHits.length

  const go = (to: string) => { setQuery(''); setQuickOpen(false); navigate(to) }

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="min-w-0">
        <nav className="flex items-center text-xs text-slate-400" aria-label="Breadcrumb">
          <Link to="/" className="hover:text-slate-600">Home</Link>
          <ChevronRight className="h-3 w-3 mx-1" />
          {isDetail ? <Link to="/projects" className="hover:text-slate-600">Products</Link> : <span>{section.label}</span>}
          {isDetail && <><ChevronRight className="h-3 w-3 mx-1" /><span className="truncate">{projectName ?? '…'}</span></>}
        </nav>
        <h1 className="text-base font-semibold text-slate-900 leading-tight truncate">{isDetail ? projectName ?? 'Product' : section.label}</h1>
      </div>

      <div className="ml-auto flex items-center gap-3" ref={boxRef}>
        <div className="relative hidden sm:block">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search products, packages, tasks…"
            className="h-9 w-48 lg:w-64 rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/30" />
          {q && (
            <div className="absolute right-0 mt-1 w-80 rounded-md border border-slate-200 bg-white shadow-lg py-1 text-sm max-h-96 overflow-y-auto">
              {totalHits === 0 && <p className="px-3 py-2 text-slate-400">No results</p>}
              {projectHits.map((p) => (
                <button key={p.id} onClick={() => go(`/projects/${p.id}`)} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                  <FolderKanban className="h-4 w-4 text-slate-400 shrink-0" /><span className="font-medium">{p.name}</span><span className="truncate text-slate-500">{p.packageType} · {p.code}</span>
                </button>
              ))}
              {taskHits.map((t) => (
                <button key={t.id} onClick={() => go('/tasks')} className="flex w-full items-center gap-2 px-3 py-2 hover:bg-slate-50 text-left">
                  <ListChecks className="h-4 w-4 text-slate-400 shrink-0" /><span className="truncate">{t.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="relative">
          <Button variant="primary" onClick={() => setQuickOpen((o) => !o)}><Plus className="h-4 w-4" /> Quick Add</Button>
          {quickOpen && (
            <div className="absolute right-0 mt-1 w-44 rounded-md border border-slate-200 bg-white shadow-lg py-1 text-sm">
              <button onClick={() => go('/projects?new=1')} className="block w-full px-3 py-2 text-left hover:bg-slate-50">New Product</button>
              <button onClick={() => go('/tasks?new=1')} className="block w-full px-3 py-2 text-left hover:bg-slate-50">New Task</button>
            </div>
          )}
        </div>

        <span className="hidden md:block text-sm text-slate-500 whitespace-nowrap">
          {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}
        </span>

        <button
          type="button"
          onClick={toggleTheme}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
        >
          {isDark ? <Sun className="h-4 w-4 text-amber-400" /> : <Moon className="h-4 w-4" />}
        </button>

        <Link to="/settings" className="rounded-md p-2 text-slate-500 hover:bg-slate-100" aria-label="Settings"><Settings className="h-4 w-4" /></Link>
      </div>
    </header>
  )
}
