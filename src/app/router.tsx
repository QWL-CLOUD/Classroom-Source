import { Navigate, createHashRouter } from 'react-router-dom';

import { AppShell } from '@/app/AppShell';
import { AgendaRoute } from '@/routes/AgendaRoute';
import { CalendarRoute } from '@/routes/CalendarRoute';
import { CategoriesRoute } from '@/routes/CategoriesRoute';
import { CalendarEventEditorRoute } from '@/routes/CalendarEventEditorRoute';
import { ExportRoute } from '@/routes/ExportRoute';
import { ImportRoute } from '@/routes/ImportRoute';
import { InsightsRoute } from '@/routes/InsightsRoute';
import { LearnersRoute } from '@/routes/LearnersRoute';
import { LibraryRoute } from '@/routes/LibraryRoute';
import { MigrationRoute } from '@/routes/MigrationRoute';
import { NotFoundRoute } from '@/routes/NotFoundRoute';
import { PlanningEditorRoute } from '@/routes/PlanningEditorRoute';
import { ScheduleBlockEditorRoute } from '@/routes/ScheduleBlockEditorRoute';
import { ScheduleOccurrenceEditorRoute } from '@/routes/ScheduleOccurrenceEditorRoute';
import { SessionEditorRoute } from '@/routes/SessionEditorRoute';
import { SettingsRoute } from '@/routes/SettingsRoute';
import { SystemHealthRoute } from '@/routes/SystemHealthRoute';
import { TasksRoute } from '@/routes/TasksRoute';
import { TemplatesRoute } from '@/routes/TemplatesRoute';
import { TodayRoute } from '@/routes/TodayRoute';
import { WeekRoute } from '@/routes/WeekRoute';

export const router = createHashRouter([
  {
    path: '/',
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/today" replace /> },
      { path: 'today', element: <TodayRoute /> },
      { path: 'week', element: <WeekRoute /> },
      { path: 'calendar', element: <CalendarRoute /> },
      { path: 'agenda', element: <AgendaRoute /> },
      { path: 'calendar/edit', element: <CalendarEventEditorRoute /> },
      { path: 'schedule/edit', element: <ScheduleBlockEditorRoute /> },
      {
        path: 'schedule/occurrence/edit',
        element: <ScheduleOccurrenceEditorRoute />,
      },
      { path: 'tasks', element: <TasksRoute /> },
      { path: 'learners', element: <LearnersRoute /> },
      { path: 'planning/edit', element: <PlanningEditorRoute /> },
      { path: 'planning/session', element: <SessionEditorRoute /> },
      { path: 'library', element: <LibraryRoute /> },
      { path: 'templates', element: <TemplatesRoute /> },
      { path: 'categories', element: <CategoriesRoute /> },
      { path: 'insights', element: <InsightsRoute /> },
      { path: 'import', element: <ImportRoute /> },
      { path: 'migration', element: <MigrationRoute /> },
      { path: 'export', element: <ExportRoute /> },
      { path: 'settings', element: <SettingsRoute /> },
      { path: 'system-health', element: <SystemHealthRoute /> },
      { path: '*', element: <NotFoundRoute /> },
    ],
  },
]);
