import { NavLink } from 'react-router-dom'
import { Archive, BarChart3, Briefcase, ChevronsLeft, ChevronsRight, FolderKanban, ListChecks, Settings, Truck } from 'lucide-react'
import { cn } from '@/utils/helpers'

export const NAV_ITEMS = [
  { to: '/', label: 'Overview', icon: BarChart3, end: true },
  { to: '/projects', label: 'Projects', icon: FolderKanban },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/suppliers', label: 'Suppliers', icon: Truck },
  { to: '/non-npi', label: 'Non-NPI Work', icon: Briefcase },
  { to: '/archived', label: 'Archived', icon: Archive },
  { to: '/settings', label: 'Settings', icon: Settings },
]

export function Sidebar({ collapsed, onToggle }: { collapsed: boolean; onToggle: () => void }) {
  return (
    <aside className={cn('fixed inset-y-0 left-0 z-30 flex flex-col border-r border-slate-200 bg-white transition-[width] duration-150', collapsed ? 'w-16' : 'w-60')}>
      <div className="flex h-14 items-center gap-2 px-4 border-b border-slate-200">
        <img src={`${import.meta.env.BASE_URL}favicon.svg`} alt="Product Management" className="h-6 w-6 rounded shrink-0" />
        {!collapsed && (
          <div className="min-w-0">
            <span className="block font-semibold text-slate-900 truncate leading-tight">Product Management</span>
          </div>
        )}
      </div>
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            title={collapsed ? label : undefined}
            className={({ isActive }) =>
              cn('flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium',
                isActive ? 'bg-primary-soft text-primary' : 'text-slate-600 hover:bg-slate-100')
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span>{label}</span>}
          </NavLink>
        ))}
      </nav>
      <button onClick={onToggle} className="flex items-center gap-3 border-t border-slate-100 px-5 py-3 text-sm text-slate-500 hover:bg-slate-50"
        aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
        {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
      </button>
    </aside>
  )
}
