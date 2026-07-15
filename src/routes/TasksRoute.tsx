import { TaskList } from '@/features/tasks/TaskList';

export function TasksRoute() {
  return (
    <section>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Workspace</p>
          <h1 className="page-title">Tasks</h1>
          <p className="page-subtitle">
            This Phase 0 smoke test already shares the same IndexedDB task records with Today.
          </p>
        </div>
      </header>
      <div className="card" style={{ padding: 24, maxWidth: 820 }}>
        <TaskList />
      </div>
    </section>
  );
}
