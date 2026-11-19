import { NavLink } from 'react-router-dom'
import { Archive, BarChart3, Briefcase, ChevronsLeft, ChevronsRight, FolderKanban, ListChecks, Settings } from 'lucide-react'
import { cn } from '@/utils/helpers'

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: BarChart3, end: true },
  { to: '/projects', label: 'Products', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/non-npi', label: 'Side-Quest', icon: Briefcase },
  { to: '/archived', label: 'Archived', icon: Archive },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside
      className={cn(
        'fixed inset-y-3 left-3 z-30 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-sm transition-[width] duration-150 overflow-hidden',
        collapsed ? 'w-16' : 'w-60',
      )}
    >
      <div className="flex h-14 items-center gap-2.5 px-4 border-b border-slate-100">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Product Management" className="h-6 w-6 rounded-lg shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <span className="block font-bold text-slate-900 truncate leading-tight tracking-tight">Product Management</span>
          </div>
        )}
      </div>
      <nav className="flex-1 p-2.5 space-y-1 overflow-y-auto">
        {!collapsed && <p className="px-3 pt-1 pb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">Workspace</p>}
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-all',
                isActive
                  ? 'bg-primary !text-white font-semibold shadow-sm'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              )
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      <button
        onClick={onToggle}
        className="flex items-center gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500 hover:bg-slate-50"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
      </button>
    </aside>
  )
}
