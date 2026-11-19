import { useEffect, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { TopBar } from './TopBar'
import { cn } from '@/utils/helpers'
import { useTheme } from '@/hooks/useTheme'
import { undoLastAction } from '@/services/undoService'

// The frame shared by every page: floating island sidebar on the left, aligned island top bar, content, and footer.
export function AppLayout() {
  useTheme()
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebar-collapsed') === '1')
  const [undoToast, setUndoToast] = useState('')
  const toggle = () => setCollapsed((c) => { localStorage.setItem('sidebar-collapsed', c ? '0' : '1'); return !c })

  // Global Ctrl+Z Undo handler
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key.toLowerCase() === 'z') {
        e.preventDefault()
        void undoLastAction().then((label) => {
          const msg = label ? `Undid: ${label}` : 'Nothing to undo'
          setUndoToast(msg)
          setTimeout(() => setUndoToast((t) => (t === msg ? '' : t)), 2600)
        })
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  return (
    <div className="min-h-screen">
      <Sidebar collapsed={collapsed} onToggle={toggle} />
      <div
        className={cn(
          'min-h-screen flex flex-col transition-[padding] duration-150 pr-3 pt-3 pb-3',
          collapsed ? 'pl-[88px]' : 'pl-[264px]',
        )}
      >
        <div className="flex-1 flex flex-col gap-3 w-full max-w-[1440px] mx-auto">
          <TopBar />
          <main className="flex-1 w-full">
            <Outlet />
          </main>
          <footer className="rounded-2xl border border-slate-200 bg-white/90 px-6 py-2.5 text-center text-xs text-slate-500 shadow-sm">
            Product Management · Website by <span className="font-semibold text-slate-700">AY &amp; ZH</span>
          </footer>
        </div>
      </div>

      {undoToast && (
        <div className="fixed top-5 left-1/2 -translate-x-1/2 z-50 rounded-full border border-slate-200 bg-white/95 backdrop-blur-md px-4 py-1.5 text-xs font-semibold text-primary shadow-lg">
          {undoToast}
        </div>
      )}
    </div>
  )
}
