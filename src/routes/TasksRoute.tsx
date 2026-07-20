import { TaskList } from '@/features/tasks/TaskList';

export function TasksRoute() {
  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            Review active work first, add tasks when needed, and keep scheduled work and deadlines
            together.
          </p>
        </div>
      </header>
      <TaskList />
    </section>
  );
}
