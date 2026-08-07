import { useSearchParams } from 'react-router-dom';

import { TaskList } from '@/features/tasks/TaskList';
import { formatLongDate, parseLocalDate } from '@/shared/dates/localDate';

export function TasksRoute() {
  const [searchParams] = useSearchParams();
  const requestedDate = searchParams.get('date');
  const focusTaskId = searchParams.get('task')?.trim() || undefined;
  const linkedReflectionId = searchParams.get('reflection')?.trim() || undefined;
  const clearFocusParams = new URLSearchParams(searchParams);
  clearFocusParams.delete('task');
  clearFocusParams.delete('reflection');
  const clearFocusQuery = clearFocusParams.toString();
  const clearFocusHref = clearFocusQuery ? `#/tasks?${clearFocusQuery}` : '#/tasks';
  const defaultScheduledDate = parseLocalDate(requestedDate) ? requestedDate! : undefined;

  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            Review active work first, add tasks when needed, and keep scheduled work and deadlines
            together.
            {defaultScheduledDate
              ? ` New tasks will start with ${formatLongDate(defaultScheduledDate)} as their work date.`
              : ''}
          </p>
        </div>
      </header>
      <TaskList
        defaultScheduledDate={defaultScheduledDate}
        focusTaskId={focusTaskId}
        linkedReflectionId={focusTaskId ? undefined : linkedReflectionId}
        clearFocusHref={focusTaskId || linkedReflectionId ? clearFocusHref : undefined}
      />
    </section>
  );
}
