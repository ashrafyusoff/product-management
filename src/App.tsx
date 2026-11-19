import { useEffect } from 'react'
import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppLayout } from '@/layouts/AppLayout'
import { initFileSync } from '@/database/fileSync'
import { OverviewPage } from '@/pages/OverviewPage'
import { ProjectsPage } from '@/pages/ProjectsPage'
import { ProjectDetailPage } from '@/pages/ProjectDetailPage'
import { TasksPage } from '@/pages/TasksPage'
import { NonNpiPage } from '@/pages/NonNpiPage'
import { ArchivedPage } from '@/pages/ArchivedPage'
import { SettingsPage } from '@/pages/SettingsPage'

// One app, one layout. Only the middle part changes when you click the sidebar (client-side navigation).
export default function App() {
  useEffect(() => {
    void initFileSync()
  }, [])

  return (
    <HashRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route index element={<OverviewPage />} />
          <Route path="projects" element={<ProjectsPage />} />
          <Route path="projects/:id" element={<ProjectDetailPage />} />
          <Route path="tasks" element={<TasksPage />} />
          <Route path="non-npi" element={<NonNpiPage />} />
          <Route path="archived" element={<ArchivedPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="*" element={<OverviewPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
